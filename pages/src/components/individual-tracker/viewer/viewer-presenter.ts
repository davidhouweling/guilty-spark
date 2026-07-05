import type { HaloInfiniteClient, MatchStats } from "halo-infinite-api";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { SeriesMatchesResponse } from "@guilty-spark/shared/contracts/stats/series-matches";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import type {
  IndividualTrackerViewService,
  TrackerViewConnection,
  TrackerViewSubscription,
} from "../../../services/individual-tracker/view-types";
import { calculateSeriesMetadata } from "../../../controllers/stats/series-metadata";
import { StatsController } from "../../../controllers/stats/stats-controller";
import { KillMatrixFormatter } from "../../../controllers/stats/kill-matrix/kill-matrix-formatter";
import { EMPTY_KILL_MATRIX_PIVOT_DATA, type KillMatrixPlayer } from "../../../controllers/stats/kill-matrix/types";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import { DEFAULT_TEAM_COLORS, getTeamColorOrDefault, type TeamColor } from "../../team-colors/team-colors";
import { gameModeIconSrc } from "../game-mode-icon";
import type {
  SeriesMatchDetail,
  SeriesMatchSummary,
  SeriesStatsSummary,
  SeriesStatsViewModel,
  SeriesTeamCard,
} from "../../series-stats/types";
import { buildViewerRenderModel } from "./viewer-render-model";
import type {
  IndividualTrackerViewerSnapshot,
  IndividualTrackerViewerStore,
  MatchEntryLoadedState,
  SeriesEntryLoadedState,
} from "./viewer-store";
import type { IndividualTrackerViewerViewModel, ViewerSeriesTab, ViewerTimelineItem } from "./types";

interface MatchStatsLoadedState {
  readonly stats: MatchStats;
  readonly playerMap: Map<string, string>;
  readonly medalMetadata: MedalMetadata;
  readonly analytics: MatchAnalytics | null;
  readonly gameMapThumbnailUrl: string;
}

interface Config {
  readonly individualTrackerService?: IndividualTrackerService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
  readonly store: IndividualTrackerViewerStore;
  readonly trackerId: string;
}

const WIN_OUTCOME = 2;
const SERIES_MATCHES_BATCH_SIZE = 30;

function isMatchStats(value: unknown): value is MatchStats {
  if (typeof value !== "object" || value == null) {
    return false;
  }

  const v = value as Record<string, unknown>;
  const matchInfo = v.MatchInfo;
  if (typeof matchInfo !== "object" || matchInfo == null) {
    return false;
  }

  const mi = matchInfo as Record<string, unknown>;
  return (
    typeof v.MatchId === "string" &&
    Array.isArray(v.Teams) &&
    Array.isArray(v.Players) &&
    typeof mi.StartTime === "string" &&
    typeof mi.EndTime === "string"
  );
}

interface BuildSeriesViewModelArgs {
  readonly series: ViewerSeriesTab;
  readonly seriesData: SeriesMatchesResponse;
  readonly rawMatches: readonly MatchStats[];
  readonly playerMap: Map<string, string>;
  readonly teamColors: readonly TeamColor[];
}

function getLatestRawMatch(rawMatches: readonly MatchStats[]): MatchStats | undefined {
  let latest: MatchStats | undefined;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const match of rawMatches) {
    const endTime = new Date(match.MatchInfo.EndTime).getTime();
    if (!Number.isFinite(endTime)) {
      continue;
    }
    if (endTime > latestTime) {
      latest = match;
      latestTime = endTime;
    }
  }

  return latest;
}

function buildSeriesViewModel({
  series,
  seriesData,
  rawMatches,
  playerMap,
  teamColors,
}: BuildSeriesViewModelArgs): SeriesStatsViewModel {
  const medalMetadata: MedalMetadata = seriesData.medalMetadata;

  // --- Series totals ---
  const seriesController = new StatsController();
  seriesController.loadSeries([...rawMatches], playerMap, medalMetadata);
  const seriesTotals = seriesController.getSeriesStats();

  const metadata = calculateSeriesMetadata(
    seriesData.matches.map((m) => ({ startTime: m.startTime, endTime: m.endTime })),
    series.score,
  );

  const seriesStats: SeriesStatsSummary = {
    teamData: seriesTotals.teamData,
    playerData: seriesTotals.playerData,
    metadata,
    teamColors,
    killMatrixPivotData: EMPTY_KILL_MATRIX_PIVOT_DATA,
    transposedKillMatrixPivotData: EMPTY_KILL_MATRIX_PIVOT_DATA,
    killMatrixStatus: ComponentLoaderStatus.LOADED,
  };

  // --- Match summaries (score cards) ---
  const matchSummaries: SeriesMatchSummary[] = seriesData.matches.map((m) => {
    let winningTeamColorHex: string | null = null;
    if (isMatchStats(m.rawMatch)) {
      const winningTeamIndex = m.rawMatch.Teams.findIndex((t) => t.Outcome === WIN_OUTCOME);
      if (winningTeamIndex >= 0) {
        winningTeamColorHex = getTeamColorOrDefault(teamColors[winningTeamIndex]?.id, winningTeamIndex).hex;
      }
    }
    return {
      matchId: m.matchId,
      gameMapThumbnailUrl: m.gameMapThumbnailUrl,
      gameModeIconUrl: gameModeIconSrc(m.gameVariantCategory),
      gameModeAlt: m.gameType,
      gameScore: m.gameScore,
      gameSubScore: m.gameSubScore,
      gameMap: m.gameMap,
      winningTeamColorHex,
    };
  });

  // --- Team cards (derived from the latest chronological match's team/player layout) ---
  const lastRawMatch = getLatestRawMatch(rawMatches);
  const teams: SeriesTeamCard[] =
    lastRawMatch === undefined
      ? []
      : lastRawMatch.Teams.map((team, teamIndex) => ({
          name: getTeamName(team.TeamId),
          players: lastRawMatch.Players.filter(
            (p) =>
              p.PlayerType === 1 &&
              p.ParticipationInfo.PresentAtBeginning &&
              p.PlayerTeamStats.some((ts) => ts.TeamId === team.TeamId),
          ).map((p) => playerMap.get(getPlayerXuid(p)) ?? "*Unknown*"),
          teamColorHex: getTeamColorOrDefault(teamColors[teamIndex]?.id, teamIndex).hex,
        }));

  // --- Per-match detail sections ---
  const matchDetails: SeriesMatchDetail[] = seriesData.matches.map((m, index) => {
    const { rawMatch } = m;
    let data = null;
    if (isMatchStats(rawMatch)) {
      try {
        const matchController = new StatsController();
        matchController.loadMatch(rawMatch, playerMap, medalMetadata);
        data = matchController.getMatchStats();
      } catch {
        data = null;
      }
    }
    return {
      matchId: m.matchId,
      data,
      gameMapThumbnailUrl: m.gameMapThumbnailUrl,
      gameModeIconUrl: gameModeIconSrc(m.gameVariantCategory),
      gameModeAlt: m.gameType,
      matchNumber: index + 1,
      gameTypeAndMap: m.gameTypeAndMap,
      duration: m.duration,
      score: m.gameSubScore != null ? `${m.gameScore} (${m.gameSubScore})` : m.gameScore,
      startTime: m.startTime,
      endTime: m.endTime,
      teamColors,
      killMatrixPivotData: EMPTY_KILL_MATRIX_PIVOT_DATA,
      transposedKillMatrixPivotData: EMPTY_KILL_MATRIX_PIVOT_DATA,
      killMatrixStatus: ComponentLoaderStatus.LOADED,
    };
  });

  return {
    title: series.title,
    subtitle: series.subtitle,
    seriesScore: series.score,
    matchSummaries,
    teams,
    seriesStats,
    matchDetails,
  };
}

export class IndividualTrackerViewerPresenter {
  private readonly config: Config;
  private isDisposed = false;
  private connection: TrackerViewConnection | null = null;
  private viewSubscription: TrackerViewSubscription | null = null;
  private statusSubscription: TrackerViewSubscription | null = null;
  private awaitingRefresh = false;
  private isHydratingEnrichedView = false;
  private hydrateQueued = false;
  private streamerSettings: StreamerViewSettings | undefined;
  private streamerSettingsKey = "null";
  private hasServerStreamerSettings = false;

  public constructor(config: Config) {
    this.config = config;
  }

  private static entryKey(item: ViewerTimelineItem): string {
    if (item.type === "match") {
      return `match:${item.match.matchId}`;
    }
    return `series:${item.series.id}`;
  }

  private shouldAbort(): boolean {
    return this.isDisposed;
  }

  public static present(snapshot: IndividualTrackerViewerSnapshot): IndividualTrackerViewerViewModel {
    const streamerSettings = snapshot.view?.streamerSettings;
    const styleFlags = streamerSettings?.styleFlags;
    return {
      renderModel:
        snapshot.view == null
          ? null
          : buildViewerRenderModel({
              view: snapshot.view,
              preferredTeamColorId: styleFlags?.playerTeamColor ?? styleFlags?.teamColor,
              preferredEnemyColorId: styleFlags?.playerEnemyColor ?? styleFlags?.enemyColor,
            }),
      connectionStatus: snapshot.connectionStatus,
      refreshPending: snapshot.refreshPending,
      expandedEntryKeys: snapshot.expandedEntryKeys,
      entryStates: snapshot.entryStates,
      streamerSettings,
    };
  }

  public refresh(): void {
    // Refresh is only available in managed context.
    if (this.config.individualTrackerService == null) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();
    if (snapshot.refreshPending || snapshot.view?.status !== "active") {
      return;
    }

    this.awaitingRefresh = true;
    this.config.store.setRefreshState(true);
    void this.refreshAsync();
  }

  public setStreamerSettings(streamerSettings: StreamerViewSettings | undefined): void {
    const nextKey = JSON.stringify(streamerSettings ?? null);
    if (nextKey === this.streamerSettingsKey) {
      return;
    }

    this.streamerSettings = streamerSettings;
    this.streamerSettingsKey = nextKey;

    if (this.hasServerStreamerSettings) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();
    if (snapshot.view == null) {
      return;
    }

    this.config.store.setLoaded({ ...snapshot.view, streamerSettings: this.streamerSettings });
  }

  public toggleEntry(item: ViewerTimelineItem): void {
    const key = IndividualTrackerViewerPresenter.entryKey(item);
    const snapshot = this.config.store.getSnapshot();
    const isExpanded = snapshot.expandedEntryKeys.has(key);
    this.config.store.setEntryExpanded(key, !isExpanded);

    if (isExpanded) {
      return;
    }

    const cachedEntryState = snapshot.entryStates.get(key);
    if (cachedEntryState != null && cachedEntryState.state.status !== "error") {
      return;
    }

    if (item.type === "match") {
      void this.fetchMatchEntry(key, item.match.matchId);
      return;
    }

    void this.fetchSeriesEntry(key, item.series);
  }

  private async fetchMatchSource(matchId: string): Promise<MatchStatsLoadedState> {
    const [seriesMatches, analytics] = await Promise.all([
      this.config.seriesMatchesService.getSeriesMatches([matchId]),
      this.config.matchAnalyticsService
        .getBatchMatchAnalytics([matchId])
        .then((results) => results[matchId] ?? null)
        .catch(() => null),
    ]);

    if (seriesMatches.matches.length === 0) {
      throw new Error("Failed to load match source");
    }

    const [matchSummary] = seriesMatches.matches;
    if (!isMatchStats(matchSummary.rawMatch)) {
      throw new Error("Failed to load match source");
    }

    const stats = matchSummary.rawMatch;
    const playerMap = new Map(Object.entries(seriesMatches.playerXuidToGametag));
    const xuids = stats.Players.filter((p) => p.PlayerType === 1).map((p) => getPlayerXuid(p));
    for (const xuid of xuids) {
      if (!playerMap.has(xuid)) {
        playerMap.set(xuid, xuid);
      }
    }

    const medalMetadata: MedalMetadata = seriesMatches.medalMetadata;

    return { stats, playerMap, medalMetadata, analytics, gameMapThumbnailUrl: matchSummary.gameMapThumbnailUrl };
  }

  private toMatchEntryLoadedState(loadedState: MatchStatsLoadedState): MatchEntryLoadedState {
    const { stats, playerMap, medalMetadata, analytics, gameMapThumbnailUrl } = loadedState;
    const controller = new StatsController();
    controller.loadMatch(stats, playerMap, medalMetadata);
    if (analytics != null) {
      controller.loadAnalytics(analytics, playerMap);
    }

    const killMatrixRows = analytics != null ? controller.getKillMatrix() : null;
    const players = controller.getPlayers();
    const playersByGamertag = new Map(players.map((p) => [p.gamertag, p]));
    const matchStats = controller.getMatchStats();
    const resolvedPlayers = matchStats
      .flatMap((teamData) => teamData.players.map((p) => playersByGamertag.get(p.name)))
      .filter((p): p is KillMatrixPlayer => p != null);
    const orderedPlayers = resolvedPlayers.length === players.length ? resolvedPlayers : players;

    return {
      matchId: stats.MatchId,
      gameVariantCategory: stats.MatchInfo.GameVariantCategory,
      gameMapThumbnailUrl,
      duration: stats.MatchInfo.Duration,
      startTime: stats.MatchInfo.StartTime,
      endTime: stats.MatchInfo.EndTime,
      data: matchStats,
      killMatrixPivotData:
        killMatrixRows != null
          ? KillMatrixFormatter.pivot(killMatrixRows, orderedPlayers)
          : EMPTY_KILL_MATRIX_PIVOT_DATA,
      transposedKillMatrixPivotData:
        killMatrixRows != null
          ? KillMatrixFormatter.transpose(killMatrixRows, orderedPlayers)
          : EMPTY_KILL_MATRIX_PIVOT_DATA,
    };
  }

  private async fetchMatchEntry(key: string, matchId: string): Promise<void> {
    this.config.store.setEntryLoading(key, "match");
    try {
      const loadedState = await this.fetchMatchSource(matchId);
      if (this.isDisposed) {
        return;
      }

      const state = this.toMatchEntryLoadedState(loadedState);
      this.config.store.setMatchEntryLoaded(key, state);
    } catch (error) {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setEntryError(key, "match", error instanceof Error ? error.message : "Failed to load stats");
    }
  }

  private async fetchSeriesEntry(key: string, series: ViewerSeriesTab): Promise<void> {
    this.config.store.setEntryLoading(key, "series");
    try {
      const requestedMatchIds = series.matches.map((match) => match.matchId);
      const uniqueMatchIds = [...new Set(requestedMatchIds)];
      const seriesDataChunks: SeriesMatchesResponse[] = [];

      for (let index = 0; index < uniqueMatchIds.length; index += SERIES_MATCHES_BATCH_SIZE) {
        if (this.shouldAbort()) {
          return;
        }
        const batchMatchIds = uniqueMatchIds.slice(index, index + SERIES_MATCHES_BATCH_SIZE);
        const batchSeriesData = await this.config.seriesMatchesService.getSeriesMatches(batchMatchIds);
        if (this.shouldAbort()) {
          return;
        }
        seriesDataChunks.push(batchSeriesData);
      }

      const mergedMatchesById = new Map(seriesDataChunks.flatMap((chunk) => chunk.matches).map((m) => [m.matchId, m]));
      const mergedSeriesData: SeriesMatchesResponse = {
        medalMetadata: Object.assign({}, ...seriesDataChunks.map((chunk) => chunk.medalMetadata)),
        playerXuidToGametag: Object.assign({}, ...seriesDataChunks.map((chunk) => chunk.playerXuidToGametag)),
        matches: requestedMatchIds
          .map((matchId) => mergedMatchesById.get(matchId))
          .filter((match): match is SeriesMatchesResponse["matches"][number] => match != null),
      };

      const playerMap = new Map(Object.entries(mergedSeriesData.playerXuidToGametag));
      const rawMatches = mergedSeriesData.matches
        .map((m) => m.rawMatch)
        .filter((m): m is MatchStats => isMatchStats(m));

      const teamColors = this.resolveTeamColors();
      const viewModel = buildSeriesViewModel({
        series,
        seriesData: mergedSeriesData,
        rawMatches,
        playerMap,
        teamColors,
      });

      const state: SeriesEntryLoadedState = { seriesId: series.id, viewModel };
      this.config.store.setSeriesEntryLoaded(key, state);
    } catch (error) {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setEntryError(key, "series", error instanceof Error ? error.message : "Failed to load series");
    }
  }

  private resolveTeamColors(): readonly TeamColor[] {
    const snapshot = this.config.store.getSnapshot();
    const styleFlags = snapshot.view?.streamerSettings?.styleFlags;
    return [
      getTeamColorOrDefault(styleFlags?.playerTeamColor ?? styleFlags?.teamColor ?? DEFAULT_TEAM_COLORS[0], 0),
      getTeamColorOrDefault(styleFlags?.playerEnemyColor ?? styleFlags?.enemyColor ?? DEFAULT_TEAM_COLORS[1], 1),
    ];
  }

  public start(): void {
    void this.load();
  }

  public dispose(): void {
    this.isDisposed = true;
    this.awaitingRefresh = false;
    this.hydrateQueued = false;
    this.viewSubscription?.unsubscribe();
    this.viewSubscription = null;
    this.statusSubscription?.unsubscribe();
    this.statusSubscription = null;
    this.connection?.disconnect();
    this.connection = null;
  }

  private async refreshAsync(): Promise<void> {
    try {
      // Only refresh in managed context when individual tracker service is available.
      if (this.config.individualTrackerService == null) {
        return;
      }
      await this.config.individualTrackerService.refreshTracker(this.config.trackerId);
      if (this.isDisposed) {
        return;
      }
    } catch {
      if (this.isDisposed) {
        return;
      }
      this.awaitingRefresh = false;
      this.config.store.setRefreshState(false);
    }
  }

  private async load(): Promise<void> {
    this.config.store.setLoading();
    try {
      const response = await this.config.individualTrackerViewService.getView(this.config.trackerId);
      if (this.isDisposed) {
        return;
      }
      this.hasServerStreamerSettings = response.view.streamerSettings !== undefined;
      const view =
        response.view.streamerSettings === undefined && this.streamerSettings !== undefined
          ? { ...response.view, streamerSettings: this.streamerSettings }
          : response.view;
      this.config.store.setLoaded(view);
      this.openConnection();
    } catch (error) {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setError(error instanceof Error ? error.message : "Failed to load tracker");
    }
  }

  private queueEnrichedViewHydration(): void {
    if (this.isDisposed) {
      return;
    }

    if (this.isHydratingEnrichedView) {
      this.hydrateQueued = true;
      return;
    }

    void this.hydrateEnrichedViewAsync();
  }

  private async hydrateEnrichedViewAsync(): Promise<void> {
    this.isHydratingEnrichedView = true;
    try {
      const response = await this.config.individualTrackerViewService.getView(this.config.trackerId);
      if (this.isDisposed) {
        return;
      }

      const snapshot = this.config.store.getSnapshot();
      if (snapshot.view == null) {
        return;
      }

      this.hasServerStreamerSettings ||= response.view.streamerSettings !== undefined;

      const streamerSettings =
        response.view.streamerSettings === undefined &&
        this.streamerSettings !== undefined &&
        !this.hasServerStreamerSettings
          ? this.streamerSettings
          : (response.view.streamerSettings ?? snapshot.view.streamerSettings);

      this.config.store.setLoaded({
        ...snapshot.view,
        isLive: response.view.isLive,
        streamerSettings,
        statsHighlights: response.view.statsHighlights,
        preSeriesPlayerInfo: response.view.preSeriesPlayerInfo,
      });
    } catch {
      // Hydration failures should not interrupt live timeline updates.
    } finally {
      this.isHydratingEnrichedView = false;
      if (this.hydrateQueued && !this.isDisposed) {
        this.hydrateQueued = false;
        void this.hydrateEnrichedViewAsync();
      }
    }
  }

  private openConnection(): void {
    this.viewSubscription?.unsubscribe();
    this.statusSubscription?.unsubscribe();
    this.connection?.disconnect();

    const connection = this.config.individualTrackerViewService.connect(this.config.trackerId);
    this.connection = connection;
    this.viewSubscription = connection.subscribe((view) => {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setView(view);
      if (this.awaitingRefresh) {
        this.awaitingRefresh = false;
        this.config.store.setRefreshState(false);
      }

      this.queueEnrichedViewHydration();
    });
    this.statusSubscription = connection.subscribeStatus((status) => {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setConnectionStatus(status);
    });
  }
}
