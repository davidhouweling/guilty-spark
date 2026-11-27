import type { SeriesAggregation, SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import type { MedalEntry } from "@guilty-spark/shared/halo/medals";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { CSSProperties } from "react";
import type { TickerMatchGroup } from "../information-ticker/information-ticker";
import type { StatsDetailController } from "../../controllers/stats/stats-detail-controller";
import {
  ALL_SLAYER_STATS,
  MAX_PREVIOUS_GAMES_TO_SHOW,
  MIN_PREVIOUS_GAMES_TO_SHOW,
} from "../live-tracker/settings/types";
import type { AllStreamerSettings } from "../live-tracker/settings/types";
import type { OverlayTab } from "../streamer-overlay/types";
import type { SeriesStatsViewModel, SeriesTeamCard } from "../series-stats/types";
import type { TeamColor } from "../team-colors/team-colors";
import { projectSeriesTicker } from "../individual-tracker/overlay/series-ticker-projection";

const SLAYER_STATS = new Set<string>(ALL_SLAYER_STATS);
type TickerStats = TickerMatchGroup["rows"][number]["stats"];
export interface ArchiveOverlayTeamModel {
  readonly name: string;
  readonly players: readonly { readonly id: string; readonly displayName: string }[];
  readonly disableTeamPlayerNames: boolean;
}

export interface ArchiveSeriesOverlayViewModel {
  readonly title: string | null;
  readonly subtitle: string | null;
  readonly iconUrl: string | null;
  readonly showScore: boolean;
  readonly showTeamDetails: boolean;
  readonly seriesScore: string;
  readonly teamColors: readonly TeamColor[];
  readonly teamLeft: ArchiveOverlayTeamModel | null;
  readonly teamRight: ArchiveOverlayTeamModel | null;
  readonly tabs: readonly OverlayTab[];
  readonly tickerMatchGroups: readonly TickerMatchGroup[];
  readonly showTabs: boolean;
  readonly showTicker: boolean;
  readonly matchesLength: number;
  readonly fontSizeStyles: CSSProperties;
  readonly seriesPanel: ArchiveOverlayPanelModel;
  readonly panelsByTabIndex: ReadonlyMap<number, ArchiveOverlayPanelModel>;
}

export type ArchiveOverlayPanelModel = SeriesStatsViewModel & { readonly showSeriesOverview: boolean };

function getVisibleStats(stats: TickerStats, settings: AllStreamerSettings): TickerStats {
  const { selectedSlayerStats, showObjectiveStats } = settings.global.ticker;
  return stats.filter(
    ({ name }) => selectedSlayerStats.includes(name) || (showObjectiveStats && !SLAYER_STATS.has(name)),
  );
}

function getVisibleMedals(medals: readonly MedalEntry[], settings: AllStreamerSettings): MedalEntry[] {
  return medals.filter(({ sortingWeight: weight }) => {
    const rarity = weight < 0 ? null : weight < 100 ? 0 : weight < 150 ? 1 : weight < 200 ? 2 : 3;
    return rarity !== null && settings.global.ticker.medalRarityFilter.includes(rarity);
  });
}

function getTickerGroups(
  aggregation: SeriesAggregation,
  seriesModel: SeriesStatsViewModel,
  settings: AllStreamerSettings,
  statsDetailController: StatsDetailController,
): TickerMatchGroup[] {
  if (aggregation.status !== "resolved") {
    return [];
  }
  const projection = projectSeriesTicker(aggregation, statsDetailController);
  if (projection.status !== "resolved") {
    return [];
  }
  const colorIndexByTeamId = new Map(
    [...aggregation.teams]
      .sort((left, right) => left.seriesTeamId - right.seriesTeamId)
      .map((team, index) => [team.seriesTeamId, index]),
  );

  const rows: TickerMatchGroup["rows"] = [
    ...projection.teamData.map((team) => ({
      type: "team" as const,
      teamId: team.teamId,
      teamColorIndex: Preconditions.checkExists(colorIndexByTeamId.get(team.teamId), "Missing series team color"),
      name:
        seriesModel.teams.find(({ seriesTeamId: id }) => id === team.teamId)?.name ??
        aggregation.teams.find(({ seriesTeamId: id }) => id === team.teamId)?.name ??
        `Team ${team.teamId.toString()}`,
      stats: getVisibleStats(team.teamStats, settings),
      medals: getVisibleMedals(team.teamMedals, settings),
      hasUnavailableMedals: team.hasUnknownRarity,
    })),
    ...projection.playerData.flatMap((team) =>
      team.players.map((player) => ({
        type: "player" as const,
        teamId: team.teamId,
        teamColorIndex: Preconditions.checkExists(colorIndexByTeamId.get(team.teamId), "Missing series team color"),
        name: player.name,
        stats: getVisibleStats(player.values, settings),
        medals: getVisibleMedals(player.medals, settings),
        hasUnavailableMedals: player.hasUnknownRarity,
      })),
    ),
  ];

  return rows.length
    ? [{ matchIndex: -1, label: "Series Stats", rows, hasUnavailableMedals: projection.hasUnknownRarity }]
    : [];
}

function getTabs(seriesId: string, model: SeriesStatsViewModel, maxPreviousGamesToShow: number): OverlayTab[] {
  const matches = model.matchSummaries.slice(-maxPreviousGamesToShow);
  const firstMatchIndex = model.matchSummaries.length - matches.length;
  return [
    {
      type: "series",
      seriesId,
      index: -1,
      label: "Series",
      score: model.seriesScore,
      teamColor: undefined,
      icons: [],
    },
    ...matches.map((match, index): OverlayTab => ({
      type: "match",
      index: firstMatchIndex + index,
      matchId: match.matchId,
      label: match.gameMap,
      score: match.gameScore,
      icon: match.gameModeIconUrl,
      teamColor: match.winningTeamColorHex ?? undefined,
    })),
  ];
}

function getTeamModel(
  team: SeriesTeamCard | undefined,
  teamIndex: number,
  settings: AllStreamerSettings,
): ArchiveOverlayTeamModel | null {
  return team == null
    ? null
    : {
        name: team.name,
        players: settings.global.display.showXboxNames
          ? team.players.map((displayName, index) => ({
              id: `${teamIndex.toString()}:${index.toString()}`,
              displayName,
            }))
          : [],
        disableTeamPlayerNames: settings.series.disableTeamPlayerNames === true,
      };
}

function getPanelModels(
  model: SeriesStatsViewModel,
  tabs: readonly OverlayTab[],
): ReadonlyMap<number, ArchiveOverlayPanelModel> {
  const panels = new Map<number, ArchiveOverlayPanelModel>([[-1, { ...model, showSeriesOverview: true }]]);
  for (const tab of tabs) {
    if (tab.type === "match") {
      panels.set(tab.index, {
        ...model,
        matchSummaries: [],
        teams: [],
        seriesStats: null,
        seriesStatsWarning: null,
        matchDetails: model.matchDetails.filter((detail) => detail.matchId === tab.matchId),
        showSeriesOverview: false,
      });
    }
  }
  return panels;
}

function getFontSizeStyles(settings: AllStreamerSettings): CSSProperties {
  return {
    "--font-size-queue-info": (settings.global.fontSizes.queueInfo / 100).toString(),
    "--font-size-score": (settings.global.fontSizes.score / 100).toString(),
    "--font-size-teams": (settings.global.fontSizes.teams / 100).toString(),
    "--font-size-tabs": (settings.global.fontSizes.tabs / 100).toString(),
    "--font-size-ticker": (settings.global.fontSizes.ticker / 100).toString(),
  } as CSSProperties;
}

export class ArchiveSeriesOverlayPresenter {
  public constructor(private readonly statsDetailController: StatsDetailController) {}

  public present(
    data: SeriesDetailResponse,
    seriesModel: SeriesStatsViewModel,
    settings: AllStreamerSettings,
    teamColors: readonly TeamColor[],
    stableTeamSlotsAvailable: boolean,
  ): ArchiveSeriesOverlayViewModel {
    const showTeamDetails = settings.global.display.showTeamDetails && stableTeamSlotsAvailable;
    const maxPreviousGamesToShow = Math.max(
      MIN_PREVIOUS_GAMES_TO_SHOW,
      Math.min(MAX_PREVIOUS_GAMES_TO_SHOW, settings.global.ticker.maxPreviousGamesToShow),
    );
    const tabs = getTabs(data.seriesId, seriesModel, maxPreviousGamesToShow);
    return {
      title: settings.global.display.showTitle
        ? (settings.series.titleOverride ?? data.context?.title ?? seriesModel.title)
        : null,
      subtitle: settings.global.display.showSubtitle
        ? (settings.series.subtitleOverride ?? data.context?.subtitle ?? seriesModel.subtitle)
        : null,
      iconUrl: settings.global.display.showServerIcon ? (data.context?.guildIconUrl ?? null) : null,
      showScore: settings.global.display.showScore && data.aggregation.status === "resolved",
      showTeamDetails,
      seriesScore: seriesModel.seriesScore,
      teamColors,
      teamLeft: showTeamDetails ? getTeamModel(seriesModel.teams[0], 0, settings) : null,
      teamRight: showTeamDetails ? getTeamModel(seriesModel.teams[1], 1, settings) : null,
      tabs,
      tickerMatchGroups: getTickerGroups(data.aggregation, seriesModel, settings, this.statsDetailController),
      showTabs: settings.global.ticker.showTabs,
      showTicker: settings.global.ticker.showTicker,
      matchesLength: seriesModel.matchSummaries.length,
      fontSizeStyles: getFontSizeStyles(settings),
      seriesPanel: { ...seriesModel, showSeriesOverview: true },
      panelsByTabIndex: getPanelModels(seriesModel, tabs),
    };
  }
}
