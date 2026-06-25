import type { HaloInfiniteClient, MatchStats } from "halo-infinite-api";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { SeriesMatchesResponse } from "@guilty-spark/shared/contracts/stats/series-matches";
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
    killMatrixStatus: ComponentLoaderStatus.PENDING,
  };

  // --- Match summaries (score cards) ---
  const matchSummaries: SeriesMatchSummary[] = seriesData.matches.map((m) => {
    const rawMatch = m.rawMatch as MatchStats | undefined;
    let winningTeamColorHex: string | null = null;
    if (isMatchStats(rawMatch)) {
      const winningTeamIndex = rawMatch.Teams.findIndex((t) => t.Outcome === WIN_OUTCOME);
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

  // --- Team cards (derived from the last match's team/player layout) ---
  const lastRawMatch = rawMatches.length > 0 ? rawMatches[rawMatches.length - 1] : undefined;
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
      killMatrixStatus: ComponentLoaderStatus.PENDING,
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

  public constructor(config: Config) {
    this.config = config;
  }

  private static entryKey(item: ViewerTimelineItem): string {
    if (item.type === "match") {
      return `match:${item.match.matchId}`;
    }
    return `series:${item.series.id}`;
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
    if (this.config.individualTrackerService == null) {
      void this.load();
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

  public toggleEntry(item: ViewerTimelineItem): void {
    const key = IndividualTrackerViewerPresenter.entryKey(item);
    const snapshot = this.config.store.getSnapshot();
    const isExpanded = snapshot.expandedEntryKeys.has(key);
    this.config.store.setEntryExpanded(key, !isExpanded);

    if (isExpanded || snapshot.entryStates.has(key)) {
      return;
    }

    if (item.type === "match") {
      void this.fetchMatchEntry(key, item.match.matchId);
      return;
    }

    void this.fetchSeriesEntry(key, item.series);
  }

  private async fetchMatchSource(matchId: string): Promise<MatchStatsLoadedState> {
    const analyticsPromise = this.config.matchAnalyticsService
      .getBatchMatchAnalytics([matchId])
      .then((results) => results[matchId] ?? null)
      .catch(() => null);
    const matchThumbnailPromise = this.config.seriesMatchesService
      .getSeriesMatches([matchId])
      .then((response) => response.matches[0]?.gameMapThumbnailUrl ?? "data:,")
      .catch(() => "data:,");
    const stats = await this.config.haloClient.getMatchStats(matchId);
    const xuids = stats.Players.filter((p) => p.PlayerType === 1).map((p) => getPlayerXuid(p));

    const [users, medalsMetadataFile, analytics, gameMapThumbnailUrl] = await Promise.all([
      this.config.haloClient.getUsers(xuids),
      this.config.haloClient.getMedalsMetadataFile(),
      analyticsPromise,
      matchThumbnailPromise,
    ]);
    const playerMap = new Map(users.map((u) => [u.xuid, u.gamertag]));
    for (const xuid of xuids) {
      if (!playerMap.has(xuid)) {
        playerMap.set(xuid, xuid);
      }
    }

    const medalMetadata: MedalMetadata = Object.fromEntries(
      medalsMetadataFile.medals.map((m) => [m.nameId, { name: m.name.value, sortingWeight: m.sortingWeight }]),
    );

    return { stats, playerMap, medalMetadata, analytics, gameMapThumbnailUrl };
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
      const matchIds = series.matches.map((m) => m.matchId);
      const seriesData = await this.config.seriesMatchesService.getSeriesMatches(matchIds);
      if (this.isDisposed) {
        return;
      }

      const playerMap = new Map(Object.entries(seriesData.playerXuidToGametag));
      const rawMatches = seriesData.matches.map((m) => m.rawMatch).filter((m): m is MatchStats => isMatchStats(m));

      const teamColors = this.resolveTeamColors();
      const viewModel = buildSeriesViewModel({ series, seriesData, rawMatches, playerMap, teamColors });

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

  private prefetchTimeline(): void {
    const snapshot = this.config.store.getSnapshot();
    if (snapshot.view == null) {
      return;
    }

    const renderModel = buildViewerRenderModel({ view: snapshot.view });
    for (const item of renderModel.timeline) {
      const key = IndividualTrackerViewerPresenter.entryKey(item);
      if (snapshot.entryStates.has(key)) {
        continue;
      }

      if (item.type === "match") {
        void this.fetchMatchEntry(key, item.match.matchId);
      } else {
        void this.fetchSeriesEntry(key, item.series);
      }
    }
  }

  public start(): void {
    void this.load();
  }

  public dispose(): void {
    this.isDisposed = true;
    this.awaitingRefresh = false;
    this.viewSubscription?.unsubscribe();
    this.viewSubscription = null;
    this.statusSubscription?.unsubscribe();
    this.statusSubscription = null;
    this.connection?.disconnect();
    this.connection = null;
  }

  private async refreshAsync(): Promise<void> {
    try {
      await this.config.individualTrackerService?.refreshTracker(this.config.trackerId);
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
      this.config.store.setLoaded(response.view);
      this.prefetchTimeline();
      this.openConnection();
    } catch (error) {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setError(error instanceof Error ? error.message : "Failed to load tracker");
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
      this.prefetchTimeline();
    });
    this.statusSubscription = connection.subscribeStatus((status) => {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setConnectionStatus(status);
    });
  }
}
