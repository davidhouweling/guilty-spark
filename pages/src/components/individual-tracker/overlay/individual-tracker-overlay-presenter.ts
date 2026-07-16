import { getTeamName } from "@guilty-spark/shared/halo/team";
import { getRankTierFromCsr } from "@guilty-spark/shared/halo/rank";
import type { MatchStats } from "halo-infinite-api";
import { differenceInHours } from "date-fns";
import TimeAgo from "javascript-time-ago";
import { createElement, type CSSProperties } from "react";
import type { MedalEntry, MedalMetadata } from "@guilty-spark/shared/halo/medals";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { summarizeSeriesOutcome } from "@guilty-spark/shared/halo/match-enrichment";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { TeamColor } from "../../team-colors/team-colors";
import type { TickerMatchGroup, TickerStatRow } from "../../information-ticker/information-ticker";
import { createMatchStatsFormatter } from "../../../controllers/stats/create";
import type { MatchStatsValues } from "../../../controllers/stats/types";
import type { OverlayTab } from "../../streamer-overlay/tabs-bar";
import type {
  IndividualTrackerViewerRenderModel,
  SeriesDetailsState,
  ViewerSeriesTab,
  ViewerTimelineItem,
} from "../viewer/types";
import { gameModeIconSrc } from "../game-mode-icon";
import { RankIcon } from "../../icons/rank-icon";
import { ALL_SLAYER_STATS, DEFAULT_TICKER_SETTINGS } from "../../live-tracker/settings/types";
import haloTrophyIconPng from "../../../assets/halo-trophy-icon.png";
import type {
  IndividualTrackerOverlayViewModel,
  OverlayDisplaySettings,
  OverlayTeamPlayerModel,
  OverlayTeamDetailsModel,
  OverlayTopSectionModel,
} from "./types";
import { getOverlayDisplaySettings, MATCHMAKING_SUMMARY_TAB_SERIES_ID } from "./types";
import "javascript-time-ago/locale/en";

const timeAgo = new TimeAgo("en");

const DIFFICULTY_RANGE = new Map<number, readonly [number, number]>([
  [0, [0, 99]],
  [1, [100, 149]],
  [2, [150, 199]],
  [3, [200, Infinity]],
]);

interface TickerFilterOptions {
  readonly trackedGamertag: string;
  readonly includeOnlyTrackedPlayer: boolean;
  readonly applyPlayerPerspectiveTickerColors: boolean;
  readonly selectedSlayerStats: readonly string[];
  readonly showObjectiveStats: boolean;
  readonly medalRarityFilter: readonly number[];
}

function getSeriesOutcomeColorHex(series: ViewerSeriesTab): string | undefined {
  const seriesOutcome = summarizeSeriesOutcome(series.matches.map((match) => match.outcome));

  if (seriesOutcome === "Win") {
    return series.matches.find((match) => match.outcome === "Win")?.colorHex;
  }

  if (seriesOutcome === "Loss") {
    return series.matches.find((match) => match.outcome === "Loss")?.colorHex;
  }

  return undefined;
}

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

function getDefaultTeamColors(): [TeamColor, TeamColor] {
  return [getTeamColorOrDefault(undefined, 0), getTeamColorOrDefault(undefined, 1)];
}

function getFontSizeStyles(streamerSettings: StreamerViewSettings | undefined): CSSProperties {
  const fontSizes = streamerSettings?.layoutOptions?.fontSizes;

  return {
    "--font-size-queue-info": ((fontSizes?.queueInfo ?? 100) / 100).toString(),
    "--font-size-score": ((fontSizes?.score ?? 100) / 100).toString(),
    "--font-size-teams": ((fontSizes?.teams ?? 100) / 100).toString(),
    "--font-size-tabs": ((fontSizes?.tabs ?? 100) / 100).toString(),
    "--font-size-ticker": ((fontSizes?.ticker ?? 100) / 100).toString(),
  } as CSSProperties;
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

  return "Unknown";
}

function getSeriesPlayerStableKey(player: {
  readonly discordName: string | null;
  readonly gamertag: string | null;
}): string {
  return `${player.discordName ?? "none"}:${player.gamertag ?? "none"}`;
}

function getTeamDetailsModel(
  team: {
    readonly name: string;
    readonly players: readonly { readonly discordName: string | null; readonly gamertag: string | null }[];
  },
  settings: Pick<OverlayDisplaySettings, "showDiscordNames" | "showXboxNames">,
): OverlayTeamDetailsModel {
  const players: readonly OverlayTeamPlayerModel[] =
    !settings.showDiscordNames && !settings.showXboxNames
      ? []
      : ((): readonly OverlayTeamPlayerModel[] => {
          const keyCounts = new Map<string, number>();

          return team.players.map((player) => {
            const baseKey = getSeriesPlayerStableKey(player);
            const count = keyCounts.get(baseKey) ?? 0;
            keyCounts.set(baseKey, count + 1);

            return {
              key: count === 0 ? baseKey : `${baseKey}:${count.toString()}`,
              label: getSeriesPlayerDisplayNameForSettings(player, settings),
            };
          });
        })();

  return {
    name: team.name,
    players,
  };
}

interface BuildOverlayViewModelOptions {
  readonly renderModel: IndividualTrackerViewerRenderModel;
  readonly streamerSettings: StreamerViewSettings | undefined;
  readonly matchStatsByMatchId: ReadonlyMap<string, MatchStatsState>;
  readonly selectedMatchId: string | null;
  readonly selectedSeriesId?: string | null;
}

interface BuildTabsOptions {
  readonly includeInSeriesSummaryTab: boolean;
  readonly includeMatchmakingSummaryTab: boolean;
  readonly matchmakingSummaryScore: string;
}

interface IndividualTrackerOverlayPresenterConfig {
  readonly defaultTeamColors?: readonly [TeamColor, TeamColor];
}

export class IndividualTrackerOverlayPresenter {
  private readonly defaultTeamColors: readonly [TeamColor, TeamColor];

  public constructor(config?: IndividualTrackerOverlayPresenterConfig) {
    this.defaultTeamColors = config?.defaultTeamColors ?? getDefaultTeamColors();
  }

  public getActiveSeries(timeline: readonly ViewerTimelineItem[]): ViewerSeriesTab | null {
    for (const item of timeline) {
      if (item.type === "series" && item.series.isActive) {
        return item.series;
      }
    }

    return null;
  }

  public buildTabs(
    timeline: readonly ViewerTimelineItem[],
    activeSeriesOverride: ViewerSeriesTab | null = null,
    options: BuildTabsOptions = {
      includeInSeriesSummaryTab: true,
      includeMatchmakingSummaryTab: true,
      matchmakingSummaryScore: "0:0",
    },
  ): readonly OverlayTab[] {
    const activeSeries = activeSeriesOverride ?? this.getActiveSeries(timeline);
    if (activeSeries != null) {
      const matchTabs = activeSeries.matches.map((match, index): OverlayTab => ({
        type: "match",
        index,
        matchId: match.matchId,
        label: match.mapName,
        score: match.score,
        icon: gameModeIconSrc(match.gameVariantCategory),
        teamColor: match.colorHex,
      }));

      if (!options.includeInSeriesSummaryTab) {
        return matchTabs;
      }

      const seriesTab: OverlayTab = {
        type: "series",
        seriesId: activeSeries.id,
        index: -1,
        label: "Series score",
        score: activeSeries.score,
        teamColor: undefined,
        icons: [],
      };

      if (activeSeries.matches.length === 0) {
        return [seriesTab];
      }

      return [seriesTab, ...matchTabs];
    }

    const matchmakingSummaryTab: OverlayTab | null = options.includeMatchmakingSummaryTab
      ? {
          type: "series",
          seriesId: MATCHMAKING_SUMMARY_TAB_SERIES_ID,
          index: -1,
          label: "Won:Loss",
          score: options.matchmakingSummaryScore,
          teamColor: undefined,
          icons: [],
        }
      : null;

    let matchIdx = 0;
    let seriesIdx = matchmakingSummaryTab != null ? -2 : -1;
    const timelineTabs = timeline.flatMap((item): readonly OverlayTab[] => {
      if (item.type === "series") {
        if (!options.includeMatchmakingSummaryTab) {
          return [];
        }

        const isMatchmakingSeries = item.series.matches.every((match) => match.isMatchmaking);

        return [
          {
            type: "series",
            seriesId: item.series.id,
            index: seriesIdx--,
            label: item.series.title,
            score: item.series.score,
            teamColor: getSeriesOutcomeColorHex(item.series),
            icons: item.series.matches.map((match) => ({
              src: gameModeIconSrc(match.gameVariantCategory),
              dimmed: isMatchmakingSeries && match.outcome === "Loss",
            })),
          },
        ];
      }

      return [
        {
          type: "match",
          index: matchIdx++,
          matchId: item.match.matchId,
          label: item.match.mapName,
          score: item.match.score,
          icon: gameModeIconSrc(item.match.gameVariantCategory),
          teamColor: item.match.colorHex,
        },
      ];
    });

    return matchmakingSummaryTab != null ? [matchmakingSummaryTab, ...timelineTabs] : timelineTabs;
  }

  public isPanelOpen(
    selectedMatchId: string | null,
    matchStatsState: MatchStatsState | null,
    selectedSeriesId: string | null,
    seriesEntryState: SeriesDetailsState | null,
  ): boolean {
    if (selectedMatchId != null && (matchStatsState?.status === "loaded" || matchStatsState?.status === "error")) {
      return true;
    }

    return selectedSeriesId != null && seriesEntryState != null;
  }

  public buildPreSeriesTickerGroup(options: {
    readonly showTicker: boolean;
    readonly showPreSeriesInfo: boolean;
    readonly activeSeries: ViewerSeriesTab | null;
    readonly playerName: string | null;
    readonly discordName: string | null;
    readonly gamertag: string | null;
    readonly preSeriesPlayerInfo: IndividualTrackerViewerRenderModel["preSeriesPlayerInfo"];
  }): TickerMatchGroup[] {
    if (!options.showTicker || !options.showPreSeriesInfo) {
      return [];
    }

    // If in a series with matches already completed, don't show pre-series ticker
    if (options.activeSeries != null && options.activeSeries.matches.length > 0) {
      return [];
    }

    // Create placeholder stat for "no data yet" - show dash
    const createPlaceholderStats = (): MatchStatsValues[] => [
      {
        name: "Matches",
        value: 0,
        bestInTeam: false,
        bestInMatch: false,
        display: "-",
      },
    ];

    const createPreSeriesPlayerStats = (): MatchStatsValues[] => {
      const info = options.preSeriesPlayerInfo;

      if (info == null) {
        return createPlaceholderStats();
      }

      const currentRankDisplay =
        info.currentRank != null && info.currentRank > 0 ? info.currentRank.toLocaleString() : "Unranked";
      const peakRankDisplay = info.allTimePeakRank != null ? info.allTimePeakRank.toLocaleString() : "-";
      const esraDisplay = info.esra != null ? Math.round(info.esra).toLocaleString() : "-";
      let lastRankedDisplay = "-";
      if (info.lastRankedGamePlayed != null) {
        const ago = differenceInHours(new Date(), new Date(info.lastRankedGamePlayed));
        lastRankedDisplay = ago < 1 ? "Less than an hour ago" : timeAgo.format(new Date(info.lastRankedGamePlayed));
      }

      return [
        {
          name: "Current rank",
          value: info.currentRank ?? 0,
          bestInTeam: false,
          bestInMatch: false,
          display: currentRankDisplay,
          icon: createElement(RankIcon, {
            rankTier: info.currentRankTier,
            subTier: info.currentRankSubTier,
            measurementMatchesRemaining: info.currentRankMeasurementMatchesRemaining,
            initialMeasurementMatches: info.currentRankInitialMeasurementMatches,
            size: "x-small",
          }),
        },
        {
          name: "Peak rank",
          value: info.allTimePeakRank ?? 0,
          bestInTeam: false,
          bestInMatch: false,
          display: peakRankDisplay,
          icon:
            info.allTimePeakRank != null
              ? createElement(RankIcon, {
                  ...getRankTierFromCsr(info.allTimePeakRank),
                  measurementMatchesRemaining: null,
                  initialMeasurementMatches: null,
                  size: "x-small",
                })
              : undefined,
        },
        {
          name: "ESRA",
          value: info.esra ?? 0,
          bestInTeam: false,
          bestInMatch: false,
          display: esraDisplay,
          icon:
            info.esra != null
              ? createElement(RankIcon, {
                  ...getRankTierFromCsr(Math.round(info.esra)),
                  measurementMatchesRemaining: null,
                  initialMeasurementMatches: null,
                  size: "x-small",
                })
              : undefined,
        },
        {
          name: "Last ranked match played",
          value: info.lastRankedGamePlayed != null ? new Date(info.lastRankedGamePlayed).getTime() : 0,
          bestInTeam: false,
          bestInMatch: false,
          display: lastRankedDisplay,
        },
      ];
    };

    // Case 1: Pre-series with active series that has teams (series exists but no matches yet)
    if (options.activeSeries?.matches.length === 0 && options.activeSeries.teams.length > 0) {
      const { activeSeries } = options;
      const seriesLabel = activeSeries.title || "Series Info";
      const rows: TickerStatRow[] = [];

      // Add each team and its players
      for (const team of activeSeries.teams) {
        // Add team row
        rows.push({
          type: "team",
          teamId: team.id,
          name: team.name,
          stats: createPlaceholderStats(),
          medals: [],
        });

        // Add each player in the team
        for (const player of team.players) {
          rows.push({
            type: "player",
            teamId: team.id,
            discordName: player.discordName,
            gamertag: player.gamertag,
            name: player.discordName ?? player.gamertag,
            stats: createPlaceholderStats(),
            medals: [],
          });
        }
      }

      return [
        {
          matchIndex: -1,
          label: seriesLabel,
          rows,
        },
      ];
    }

    // Case 2: Fallback for matchmaking UI or series with no teams yet - show tracked player info
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
            stats: createPreSeriesPlayerStats(),
            medals: [],
          },
        ],
      },
    ];
  }

  public present(options: BuildOverlayViewModelOptions): IndividualTrackerOverlayViewModel {
    const { renderModel, streamerSettings } = options;
    const displaySettings = getOverlayDisplaySettings(streamerSettings);
    const fontSizeStyles = getFontSizeStyles(streamerSettings);
    const activeSeries = this.getOverlayActiveSeries(renderModel);
    const teamColors = this.getTeamColors(renderModel, activeSeries);
    const showTicker = this.getShowTicker(streamerSettings, activeSeries, displaySettings.showTicker);
    const matchmakingSummaryScore = this.getMatchmakingSummaryScore(
      renderModel.statsHighlights,
      renderModel.accumulated,
    );
    const tabs = this.buildTabs(renderModel.timeline, activeSeries, {
      includeInSeriesSummaryTab: streamerSettings?.styleFlags?.inSeriesShowSeriesTab ?? true,
      includeMatchmakingSummaryTab: streamerSettings?.styleFlags?.matchmakingShowSummaryTab ?? true,
      matchmakingSummaryScore,
    });
    const loadedTickerGroups = this.buildTickerGroups(options.matchStatsByMatchId, tabs, {
      trackedGamertag: renderModel.gamertag,
      includeOnlyTrackedPlayer: this.getIncludeOnlyTrackedPlayer(streamerSettings, activeSeries),
      applyPlayerPerspectiveTickerColors: activeSeries == null,
      selectedSlayerStats: this.getSelectedSlayerStats(streamerSettings),
      showObjectiveStats: this.getShowObjectiveStats(streamerSettings),
      medalRarityFilter: this.getMedalRarityFilter(streamerSettings),
    });
    const tickerMatchGroups =
      loadedTickerGroups.length > 0
        ? loadedTickerGroups
        : this.buildPreSeriesTickerGroup({
            showTicker,
            showPreSeriesInfo: streamerSettings?.styleFlags?.showPreSeriesInfo ?? true,
            activeSeries,
            playerName: displaySettings.showXboxNames ? renderModel.gamertag : null,
            discordName: null,
            gamertag: displaySettings.showXboxNames ? renderModel.gamertag : null,
            preSeriesPlayerInfo: renderModel.preSeriesPlayerInfo,
          });

    return {
      pinTopSection: activeSeries != null,
      topSection:
        activeSeries != null ? this.getTopSectionModel(activeSeries, displaySettings, streamerSettings) : null,
      statsHighlights: this.getMatchmakingStatsHighlights(streamerSettings, activeSeries, renderModel.statsHighlights),
      teamColors,
      tabs,
      tickerMatchGroups,
      showTabs: displaySettings.showTabs && tabs.length > 0,
      showTicker,
      showPreSeriesInfo: tickerMatchGroups.length > 0 && activeSeries?.matches.length === 0,
      fontSizeStyles,
    };
  }

  private getMatchmakingStatsHighlights(
    streamerSettings: StreamerViewSettings | undefined,
    activeSeries: ViewerSeriesTab | null,
    statsHighlights: IndividualTrackerViewerRenderModel["statsHighlights"],
  ): IndividualTrackerOverlayViewModel["statsHighlights"] {
    if (activeSeries != null) {
      return [];
    }

    if (streamerSettings?.styleFlags?.matchmakingShowStatsHighlights === false) {
      return [];
    }

    return statsHighlights ?? [];
  }

  private getMatchmakingSummaryScore(
    statsHighlights: IndividualTrackerViewerRenderModel["statsHighlights"],
    accumulated: IndividualTrackerViewerRenderModel["accumulated"],
  ): string {
    const wonLossHighlight = statsHighlights?.find((item) => item.label === "Won:Loss");
    if (wonLossHighlight?.value != null && wonLossHighlight.value !== "") {
      return wonLossHighlight.value;
    }

    return `${accumulated.wins.toString()}:${accumulated.losses.toString()}`;
  }

  private getOverlayActiveSeries(renderModel: IndividualTrackerViewerRenderModel): ViewerSeriesTab | null {
    const timelineSeries = this.getActiveSeries(renderModel.timeline);
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
      guildIconUrl: renderModel.activeSeriesContext.guildIconUrl ?? null,
      isActive: true,
      teams: renderModel.activeSeriesContext.teams,
      matchBackgroundUrls: [],
      score: "0:0",
      duration: "unknown",
      killsDeathsAssistsKda: "-:-:- (-)",
      damageDealtTakenRatio: "-:- (-)",
      startTime: "",
      endTime: "",
      matches: [],
      colorHex: undefined,
    };
  }

  private getTopSectionModel(
    activeSeries: ViewerSeriesTab,
    settings: OverlayDisplaySettings,
    streamerSettings: StreamerViewSettings | undefined,
  ): OverlayTopSectionModel {
    const teamLeft = activeSeries.teams.find((team) => team.id === 0);
    const teamRight = activeSeries.teams.find((team) => team.id === 1);
    const showTeamDetails = settings.showTeamDetails && teamLeft != null && teamRight != null;

    return {
      title: settings.showTitle ? activeSeries.title : null,
      subtitle: settings.showSubtitle && activeSeries.subtitle !== "" ? activeSeries.subtitle : null,
      iconUrl: settings.showServerIcon ? (activeSeries.guildIconUrl ?? haloTrophyIconPng.src) : null,
      showScore: settings.showScore,
      seriesScore: activeSeries.score,
      showTeamDetails,
      disableTeamPlayerNames: streamerSettings?.styleFlags?.disableTeamPlayerNames === true,
      teamLeft: showTeamDetails ? getTeamDetailsModel(teamLeft, settings) : null,
      teamRight: showTeamDetails ? getTeamDetailsModel(teamRight, settings) : null,
    };
  }

  private getTeamColors(
    renderModel: IndividualTrackerViewerRenderModel,
    activeSeries: ViewerSeriesTab | null,
  ): TeamColor[] {
    if (renderModel.teamColors.length < 2) {
      return [...this.defaultTeamColors];
    }

    const [playerTeamColor, enemyTeamColor] = renderModel.teamColors;

    // If no active series or no teams, use colors as-is (player perspective for matchmaking)
    if (activeSeries == null || activeSeries.teams.length < 2) {
      return [playerTeamColor, enemyTeamColor];
    }

    // Find which team the tracked player is on
    const trackedPlayerTeamId = activeSeries.teams.find((team) =>
      team.players.some((player) => player.gamertag === renderModel.gamertag),
    )?.id;

    // If player not found in series, use colors as-is
    if (trackedPlayerTeamId == null) {
      return [playerTeamColor, enemyTeamColor];
    }

    // Map player perspective colors to actual team positions
    // If player is on team 0, playerTeamColor goes to team 0
    // If player is on team 1, playerTeamColor goes to team 1, enemyTeamColor to team 0
    return trackedPlayerTeamId === 0 ? [playerTeamColor, enemyTeamColor] : [enemyTeamColor, playerTeamColor];
  }

  private buildTickerGroups(
    matchStatsByMatchId: ReadonlyMap<string, MatchStatsState>,
    tabs: readonly OverlayTab[],
    filterOptions: TickerFilterOptions,
  ): TickerMatchGroup[] {
    const groups: TickerMatchGroup[] = [];

    for (const tab of tabs) {
      if (tab.type !== "match") {
        continue;
      }

      const matchState = matchStatsByMatchId.get(tab.matchId);
      if (matchState?.status !== "loaded") {
        continue;
      }

      const formatter = createMatchStatsFormatter(matchState.stats.MatchInfo.GameVariantCategory);
      const data = formatter.getData(matchState.stats, matchState.playerMap, matchState.medalMetadata);

      const rows = data.flatMap((teamData) => [
        {
          type: "team" as const,
          teamId: teamData.teamId,
          name: getTeamName(teamData.teamId),
          stats: this.filterTickerStats(teamData.teamStats, filterOptions),
          medals: this.filterTickerMedals(teamData.teamMedals, filterOptions.medalRarityFilter),
        },
        ...teamData.players.map((player) => ({
          type: "player" as const,
          teamId: teamData.teamId,
          name: player.name,
          discordName: null,
          gamertag: player.name,
          stats: this.filterTickerStats(player.values, filterOptions),
          medals: this.filterTickerMedals(player.medals, filterOptions.medalRarityFilter),
        })),
      ]);

      const rowsWithColorSlots = this.applyTickerColorSlots(rows, filterOptions);

      const filteredRows = this.filterRowsForTrackedPlayer(rowsWithColorSlots, filterOptions);
      if (filteredRows.length === 0) {
        continue;
      }

      groups.push({
        matchIndex: tab.index,
        label: tab.label,
        rows: filteredRows,
      });
    }

    return groups;
  }

  private getIncludeOnlyTrackedPlayer(
    streamerSettings: StreamerViewSettings | undefined,
    activeSeries: ViewerSeriesTab | null,
  ): boolean {
    if (activeSeries != null) {
      return streamerSettings?.styleFlags?.inSeriesMyStatsOnly === true;
    }

    return streamerSettings?.styleFlags?.matchmakingMyStatsOnly === true;
  }

  private getShowTicker(
    streamerSettings: StreamerViewSettings | undefined,
    activeSeries: ViewerSeriesTab | null,
    fallbackShowTicker: boolean,
  ): boolean {
    if (activeSeries != null) {
      return streamerSettings?.styleFlags?.inSeriesShowTicker ?? fallbackShowTicker;
    }

    return streamerSettings?.styleFlags?.matchmakingShowTicker ?? fallbackShowTicker;
  }

  private getSelectedSlayerStats(streamerSettings: StreamerViewSettings | undefined): readonly string[] {
    return (
      streamerSettings?.styleFlags?.selectedSlayerStats ??
      streamerSettings?.visibleSections?.selectedSlayerStats ??
      DEFAULT_TICKER_SETTINGS.selectedSlayerStats
    );
  }

  private getShowObjectiveStats(streamerSettings: StreamerViewSettings | undefined): boolean {
    return (
      streamerSettings?.styleFlags?.showObjectiveStats ??
      streamerSettings?.visibleSections?.showObjectiveStats ??
      DEFAULT_TICKER_SETTINGS.showObjectiveStats
    );
  }

  private getMedalRarityFilter(streamerSettings: StreamerViewSettings | undefined): readonly number[] {
    return (
      streamerSettings?.styleFlags?.medalRarityFilter ??
      streamerSettings?.visibleSections?.medalRarityFilter ??
      DEFAULT_TICKER_SETTINGS.medalRarityFilter
    );
  }

  private filterTickerStats(
    stats: readonly MatchStatsValues[],
    filterOptions: TickerFilterOptions,
  ): MatchStatsValues[] {
    return stats.filter((stat) => {
      if (filterOptions.selectedSlayerStats.includes(stat.name)) {
        return true;
      }

      if (filterOptions.showObjectiveStats) {
        return !(ALL_SLAYER_STATS as readonly string[]).includes(stat.name);
      }

      return false;
    });
  }

  private filterTickerMedals(
    medals: readonly MedalEntry[],
    medalRarityFilter: readonly number[],
  ): TickerStatRow["medals"] {
    return medals.flatMap((medal) => {
      for (const [difficultyIndex, [minimumWeight, maximumWeight]] of DIFFICULTY_RANGE.entries()) {
        if (medal.sortingWeight >= minimumWeight && medal.sortingWeight <= maximumWeight) {
          return medalRarityFilter.includes(difficultyIndex) ? [{ name: medal.name, count: medal.count }] : [];
        }
      }

      return [];
    });
  }

  private filterRowsForTrackedPlayer(
    rows: TickerMatchGroup["rows"],
    filterOptions: TickerFilterOptions,
  ): TickerMatchGroup["rows"] {
    if (!filterOptions.includeOnlyTrackedPlayer) {
      return rows;
    }

    const trackedGamertag = filterOptions.trackedGamertag.trim().toLowerCase();
    if (trackedGamertag === "") {
      return rows;
    }

    const trackedPlayerRows = rows.filter((row) => {
      if (row.type !== "player") {
        return false;
      }

      const candidate = row.gamertag ?? row.name;
      if (candidate == null) {
        return false;
      }

      return candidate.trim().toLowerCase() === trackedGamertag;
    });

    return trackedPlayerRows.length > 0 ? trackedPlayerRows : rows;
  }

  private applyTickerColorSlots(
    rows: TickerMatchGroup["rows"],
    filterOptions: Pick<TickerFilterOptions, "trackedGamertag" | "applyPlayerPerspectiveTickerColors">,
  ): TickerMatchGroup["rows"] {
    if (!filterOptions.applyPlayerPerspectiveTickerColors) {
      return rows;
    }

    const trackedGamertag = filterOptions.trackedGamertag.trim().toLowerCase();
    if (trackedGamertag === "") {
      return rows;
    }

    const trackedPlayerTeamId = rows.find((row) => {
      if (row.type !== "player") {
        return false;
      }

      const candidate = row.gamertag ?? row.name;
      return candidate?.trim().toLowerCase() === trackedGamertag;
    })?.teamId;

    if (trackedPlayerTeamId == null) {
      return rows;
    }

    return rows.map((row) => ({
      ...row,
      teamColorIndex: row.teamId === trackedPlayerTeamId ? 0 : 1,
    }));
  }
}
