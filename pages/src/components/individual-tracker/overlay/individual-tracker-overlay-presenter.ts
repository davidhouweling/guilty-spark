import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import type { MatchStats } from "halo-infinite-api";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { TeamColor } from "../../team-colors/team-colors";
import type { TickerMatchGroup } from "../../information-ticker/information-ticker";
import { createMatchStatsFormatter } from "../../../controllers/stats/create";
import type { OverlayTab } from "../../streamer-overlay/tabs-bar";
import type { IndividualTrackerViewerRenderModel, ViewerSeriesTab, ViewerTimelineItem } from "../viewer/types";
import { gameModeIconSrc } from "../game-mode-icon";
import type {
  IndividualTrackerOverlayViewModel,
  OverlayDisplaySettings,
  OverlayTeamDetailsModel,
  OverlayTopSectionModel,
} from "./types";
import { getOverlayDisplaySettings } from "./types";

export type MatchStatsState =
  | { readonly status: "loading" }
  | {
      readonly status: "loaded";
      readonly stats: MatchStats;
      readonly playerMap: Map<string, string>;
      readonly medalMetadata: MedalMetadata;
      readonly analytics: MatchAnalytics | null;
    }
  | { readonly status: "error"; readonly message: string };

export function getDefaultTeamColors(): [TeamColor, TeamColor] {
  return [getTeamColorOrDefault(undefined, 0), getTeamColorOrDefault(undefined, 1)];
}

function getFontSizeStyles(streamerSettings: StreamerViewSettings | undefined): React.CSSProperties {
  const fontSizes = streamerSettings?.layoutOptions?.fontSizes;

  return {
    "--font-size-queue-info": ((fontSizes?.queueInfo ?? 100) / 100).toString(),
    "--font-size-score": ((fontSizes?.score ?? 100) / 100).toString(),
    "--font-size-teams": ((fontSizes?.teams ?? 100) / 100).toString(),
    "--font-size-tabs": ((fontSizes?.tabs ?? 100) / 100).toString(),
    "--font-size-ticker": ((fontSizes?.ticker ?? 100) / 100).toString(),
  } as React.CSSProperties;
}

export function getActiveSeries(timeline: readonly ViewerTimelineItem[]): ViewerSeriesTab | null {
  for (const item of timeline) {
    if (item.type === "series" && item.series.isActive) {
      return item.series;
    }
  }

  return null;
}

function getOverlayActiveSeries(renderModel: IndividualTrackerViewerRenderModel): ViewerSeriesTab | null {
  const timelineSeries = getActiveSeries(renderModel.timeline);
  if (timelineSeries != null) {
    return timelineSeries;
  }

  if (!renderModel.hasActiveSeries || renderModel.activeSeriesContext == null) {
    return null;
  }

  return {
    id: "active-series-pre-match",
    title: renderModel.activeSeriesContext.title,
    subtitle: renderModel.activeSeriesContext.subtitle ?? "",
    isActive: true,
    teams: renderModel.activeSeriesContext.teams,
    matchBackgroundUrls: [],
    score: "0:0",
    duration: "unknown",
    startTime: "",
    endTime: "",
    matches: [],
    colorHex: undefined,
  };
}

function getSeriesPlayerDisplayNameForSettings(
  player: { readonly discordName: string | null; readonly gamertag: string | null },
  settings: Pick<OverlayDisplaySettings, "showDiscordNames" | "showXboxNames">,
): string {
  if (settings.showDiscordNames && settings.showXboxNames) {
    return player.discordName ?? player.gamertag ?? "Unknown";
  }

  if (settings.showDiscordNames) {
    return player.discordName ?? "Unknown";
  }

  if (settings.showXboxNames) {
    return player.gamertag ?? "Unknown";
  }

  return player.discordName ?? player.gamertag ?? "Unknown";
}

function getTeamDetailsModel(
  team: {
    readonly name: string;
    readonly players: readonly { readonly discordName: string | null; readonly gamertag: string | null }[];
  },
  settings: Pick<OverlayDisplaySettings, "showDiscordNames" | "showXboxNames">,
): OverlayTeamDetailsModel {
  const players =
    !settings.showDiscordNames && !settings.showXboxNames
      ? []
      : team.players.map((player) => getSeriesPlayerDisplayNameForSettings(player, settings));

  return {
    name: team.name,
    players,
  };
}

function getTopSectionModel(activeSeries: ViewerSeriesTab, settings: OverlayDisplaySettings): OverlayTopSectionModel {
  const teamLeft = activeSeries.teams.find((team) => team.id === 0);
  const teamRight = activeSeries.teams.find((team) => team.id === 1);
  const showTeamDetails = settings.showTeamDetails && teamLeft != null && teamRight != null;

  return {
    title: settings.showTitle ? activeSeries.title : null,
    subtitle: settings.showSubtitle && activeSeries.subtitle !== "" ? activeSeries.subtitle : null,
    showScore: settings.showScore,
    seriesScore: activeSeries.score,
    showTeamDetails,
    teamLeft: showTeamDetails ? getTeamDetailsModel(teamLeft, settings) : null,
    teamRight: showTeamDetails ? getTeamDetailsModel(teamRight, settings) : null,
  };
}

function getTeamColors(renderModel: IndividualTrackerViewerRenderModel): TeamColor[] {
  if (renderModel.teamColors.length >= 2) {
    return [renderModel.teamColors[0], renderModel.teamColors[1]];
  }

  return getDefaultTeamColors();
}

export function buildTabs(
  timeline: readonly ViewerTimelineItem[],
  activeSeriesOverride: ViewerSeriesTab | null = null,
): readonly OverlayTab[] {
  const activeSeries = activeSeriesOverride ?? getActiveSeries(timeline);
  if (activeSeries != null) {
    if (activeSeries.matches.length === 0) {
      return [
        {
          type: "series",
          seriesId: activeSeries.id,
          index: -1,
          label: "Series score",
          score: activeSeries.score,
          teamColor: undefined,
        },
      ];
    }

    return activeSeries.matches.map(
      (match, index): OverlayTab => ({
        type: "match",
        index,
        matchId: match.matchId,
        label: match.mapName,
        score: match.score,
        icon: gameModeIconSrc(match.gameVariantCategory),
        teamColor: match.colorHex,
      }),
    );
  }

  let matchIdx = 0;
  let seriesIdx = -1;
  return timeline.map((item): OverlayTab => {
    if (item.type === "series") {
      return {
        type: "series",
        seriesId: item.series.id,
        index: seriesIdx--,
        label: item.series.title,
        score: item.series.score,
        teamColor: undefined,
        icons: item.series.matches.map((match) => ({
          src: gameModeIconSrc(match.gameVariantCategory),
          dimmed: false,
        })),
      };
    }
    return {
      type: "match",
      index: matchIdx++,
      matchId: item.match.matchId,
      label: item.match.mapName,
      score: item.match.score,
      icon: gameModeIconSrc(item.match.gameVariantCategory),
      teamColor: item.match.colorHex,
    };
  });
}

export function getSelectedTabIndex(tabs: readonly OverlayTab[], selectedMatchId: string | null): number {
  if (selectedMatchId == null) {
    return 0;
  }
  const tab = tabs.find((t) => t.type === "match" && t.matchId === selectedMatchId);
  return tab?.type === "match" ? tab.index : 0;
}

export function isPanelOpen(selectedMatchId: string | null, matchStatsState: MatchStatsState | null): boolean {
  return selectedMatchId != null && (matchStatsState?.status === "loaded" || matchStatsState?.status === "error");
}

export function buildTickerGroups(matchStatsState: MatchStatsState | null, matchIndex: number): TickerMatchGroup[] {
  if (matchStatsState?.status !== "loaded") {
    return [];
  }

  const { stats } = matchStatsState;
  const formatter = createMatchStatsFormatter(stats.MatchInfo.GameVariantCategory);
  const playerMap = new Map(stats.Players.map((p) => [getPlayerXuid(p), getPlayerXuid(p)]));
  const data = formatter.getData(stats, playerMap, {});

  return [
    {
      matchIndex,
      label: "",
      rows: data.flatMap((teamData) => [
        {
          type: "team" as const,
          teamId: teamData.teamId,
          name: getTeamName(teamData.teamId),
          stats: teamData.teamStats,
          medals: teamData.teamMedals,
        },
        ...teamData.players.map((p) => ({
          type: "player" as const,
          teamId: teamData.teamId,
          name: p.name,
          stats: p.values,
          medals: p.medals,
        })),
      ]),
    },
  ];
}

export function buildPreSeriesTickerGroup(options: {
  readonly showTicker: boolean;
  readonly activeSeries: ViewerSeriesTab | null;
  readonly playerName: string;
  readonly discordName: string | null;
  readonly gamertag: string | null;
}): TickerMatchGroup[] {
  if (!options.showTicker || options.activeSeries == null || options.activeSeries.matches.length > 0) {
    return [];
  }

  return [
    {
      matchIndex: -1,
      label: "Player Info",
      rows: [
        {
          type: "player",
          teamId: 0,
          name: options.playerName,
          discordName: options.discordName,
          gamertag: options.gamertag,
          showTeamIcon: false,
          stats: [
            {
              name: "Status",
              value: 0,
              bestInTeam: false,
              bestInMatch: false,
              display: "Waiting for first match",
            },
          ],
          medals: [],
        },
      ],
    },
  ];
}

export function getShowTabs(renderModel: IndividualTrackerViewerRenderModel): boolean {
  return renderModel.timeline.length > 0 || renderModel.hasActiveSeries;
}

export function buildOverlayViewModel(options: {
  readonly renderModel: IndividualTrackerViewerRenderModel;
  readonly streamerSettings: StreamerViewSettings | undefined;
  readonly matchStatsState: MatchStatsState | null;
  readonly selectedMatchId: string | null;
}): IndividualTrackerOverlayViewModel {
  const { renderModel, streamerSettings, matchStatsState, selectedMatchId } = options;
  const displaySettings = getOverlayDisplaySettings(streamerSettings);
  const fontSizeStyles = getFontSizeStyles(streamerSettings);
  const teamColors = getTeamColors(renderModel);
  const activeSeries = getOverlayActiveSeries(renderModel);
  const tabs = buildTabs(renderModel.timeline, activeSeries);
  const selectedTabIndex = getSelectedTabIndex(tabs, selectedMatchId);
  const loadedTickerGroups = buildTickerGroups(matchStatsState, selectedTabIndex);
  const tickerMatchGroups =
    loadedTickerGroups.length > 0
      ? loadedTickerGroups
      : buildPreSeriesTickerGroup({
          showTicker: displaySettings.showTicker,
          activeSeries,
          playerName: renderModel.gamertag,
          discordName: null,
          gamertag: displaySettings.showXboxNames ? renderModel.gamertag : null,
        });

  return {
    pinTopSection: activeSeries != null,
    topSection: activeSeries != null ? getTopSectionModel(activeSeries, displaySettings) : null,
    statsHighlights: renderModel.statsHighlights ?? [],
    teamColors,
    tabs,
    tickerMatchGroups,
    showTabs: displaySettings.showTabs && getShowTabs(renderModel),
    showTicker: displaySettings.showTicker,
    showPreSeriesInfo: tickerMatchGroups.length > 0 && activeSeries?.matches.length === 0,
    fontSizeStyles,
  };
}
