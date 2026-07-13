import type { LiveTrackerIdentity, LiveTrackerMessage } from "@guilty-spark/shared/live-tracker/types";
import type { MatchStats } from "halo-infinite-api";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { HaloMedalMetadataResolver } from "../../services/halo/medal-metadata-resolver";
import type {
  LiveTrackerConnection,
  LiveTrackerConnectionStatus,
  LiveTrackerService,
  LiveTrackerSubscription,
} from "../../services/live-tracker/types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { MatchStatsData } from "../../controllers/stats/types";
import { ComponentLoaderStatus } from "../component-loader/component-loader";
import { StatsController } from "../../controllers/stats/stats-controller";
import { calculateSeriesMetadata } from "../../controllers/stats/series-metadata";
import { GAMES_SUFFIX_RE, KillMatrixFormatter } from "../../controllers/stats/kill-matrix/kill-matrix-formatter";
import { EMPTY_KILL_MATRIX_PIVOT_DATA } from "../../controllers/stats/kill-matrix/types";
import type { KillMatrixPlayer } from "../../controllers/stats/kill-matrix/types";
import type { LiveTrackerParams, LiveTrackerSnapshot, LiveTrackerStoreApi } from "./live-tracker-store";
import type {
  LiveTrackerViewModel,
  LiveTrackerStateRenderModel,
  MatchKillMatrix,
  KillMatrixResult,
  LiveTrackerSeriesStatsData,
} from "./types";
import { toLiveTrackerStateRenderModel } from "./state-render-model";

interface Config {
  readonly liveTrackerService: LiveTrackerService;
  readonly getUrl: () => URL;
  readonly store: LiveTrackerStoreApi;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
}

function isMatchStats(value: unknown): value is MatchStats {
  if (typeof value !== "object" || value == null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const matchInfo = record.MatchInfo;
  if (typeof matchInfo !== "object" || matchInfo == null) {
    return false;
  }

  const matchInfoRecord = matchInfo as Record<string, unknown>;
  return (
    typeof record.MatchId === "string" &&
    Array.isArray(record.Teams) &&
    Array.isArray(record.Players) &&
    typeof matchInfoRecord.StartTime === "string" &&
    typeof matchInfoRecord.EndTime === "string"
  );
}

export class LiveTrackerPresenter {
  public static readonly usageText = "Usage: /tracker?server=123&queue=1";

  private readonly config: Config;

  private isDisposed = false;
  private connection: LiveTrackerConnection | null = null;
  private messageSubscription: LiveTrackerSubscription | null = null;
  private statusSubscription: LiveTrackerSubscription | null = null;

  private reconnectionTimer: NodeJS.Timeout | null = null;
  private firstReconnectionTimestamp: number | null = null;
  private reconnectionAttempt = 0;
  private readonly maxReconnectionAttempts = 10;
  private readonly maxReconnectionDurationMs = 3 * 60 * 1000;
  private readonly baseReconnectionDelayMs = 2000;

  private readonly fetchedMatchIds = new Set<string>();
  private stateMessageVersion = 0;
  private static readonly killMatrixFormatter = new KillMatrixFormatter();
  private static readonly ANALYTICS_BATCH_SIZE = 30;

  public constructor(config: Config) {
    this.config = config;
  }

  public static present(snapshot: LiveTrackerSnapshot): LiveTrackerViewModel {
    const { connectionState, lastStateMessage, params, statusText: initialStatusText } = snapshot;

    const title =
      lastStateMessage?.type === "state"
        ? lastStateMessage.data.guildName
        : params.server.length > 0
          ? `Guild ${params.server}`
          : "";
    const subtitle = params.queue.length > 0 ? `Queue #${params.queue}` : "";
    const iconUrl = lastStateMessage?.type === "state" ? lastStateMessage.data.guildIcon : null;

    let statusClassName = "";
    if (connectionState === "connected") {
      statusClassName = "connected";
    } else if (
      connectionState === "error" ||
      connectionState === "stopped" ||
      connectionState === "connecting" ||
      connectionState === "not_found"
    ) {
      statusClassName = "error";
    }

    let statusText: string;

    if (connectionState === "connected" && lastStateMessage?.type === "state") {
      statusText = lastStateMessage.data.status;
    } else {
      statusText = initialStatusText;
    }

    const state =
      lastStateMessage?.type === "state"
        ? toLiveTrackerStateRenderModel(lastStateMessage, snapshot.medalMetadata)
        : null;
    const substitutions = state?.type === "neatqueue" ? state.substitutions : [];
    const sortedSubstitutions = [...substitutions].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const availablePlayers =
      state?.type === "neatqueue"
        ? state.teams.flatMap((team) => team.players.map((player) => ({ id: player.id, name: player.displayName })))
        : [];

    const { allMatchStats, seriesStatsData } = snapshot;

    const seriesStats =
      seriesStatsData != null
        ? {
            teamData: seriesStatsData.teamData,
            playerData: seriesStatsData.playerData,
            metadata: seriesStatsData.metadata,
          }
        : null;

    const { allMatchKillMatrix, seriesKillMatrix } = LiveTrackerPresenter.computeKillMatrix(
      state,
      seriesStatsData,
      snapshot.analyticsByMatchId,
    );

    return {
      title,
      subtitle,
      statusText,
      statusClassName,
      iconUrl,
      state,
      sortedSubstitutions,
      availablePlayers,
      params,
      allMatchStats,
      seriesStats,
      analyticsStatus: snapshot.analyticsStatus,
      allMatchKillMatrix,
      seriesKillMatrix,
    };
  }

  private static computeAllMatchStats(
    state: LiveTrackerStateRenderModel | null,
  ): readonly { matchId: string; data: MatchStatsData[] | null }[] {
    if (state?.type !== "neatqueue") {
      return [];
    }

    const { medalMetadata } = state;

    return state.matches.map((match) => {
      if (match.rawMatchStats == null) {
        return { matchId: match.matchId, data: null };
      }

      try {
        const controller = new StatsController();
        const playerMap = new Map<string, string>(Object.entries(match.playerXuidToGametag));
        controller.loadMatch(match.rawMatchStats, playerMap, medalMetadata);
        return { matchId: match.matchId, data: controller.getMatchStats() };
      } catch {
        return { matchId: match.matchId, data: null };
      }
    });
  }

  private static computeLiveTrackerSeriesStatsData(
    state: LiveTrackerStateRenderModel | null,
  ): LiveTrackerSeriesStatsData | null {
    if (state?.type !== "neatqueue" || state.matches.length === 0) {
      return null;
    }

    const rawMatchStats = state.matches
      .map((match) => match.rawMatchStats)
      .filter((stats): stats is NonNullable<typeof stats> => stats != null);

    if (rawMatchStats.length === 0) {
      return null;
    }

    try {
      const allPlayerXuidToGametag = new Map<string, string>();
      for (const match of state.matches) {
        for (const [xuid, gamertag] of Object.entries(match.playerXuidToGametag)) {
          allPlayerXuidToGametag.set(xuid, gamertag);
        }
      }

      const controller = new StatsController();
      controller.loadSeries(rawMatchStats, allPlayerXuidToGametag, state.medalMetadata);
      const { teamData, playerData } = controller.getSeriesStats();
      const players = controller.getPlayers();
      const playersByGamertag = new Map(players.map((p) => [p.gamertag, p]));
      const resolvedPlayers = playerData
        .flatMap((td) => td.players.map((p) => playersByGamertag.get(p.name.replace(GAMES_SUFFIX_RE, ""))))
        .filter((p): p is KillMatrixPlayer => p != null);
      const orderedPlayers = resolvedPlayers.length === players.length ? resolvedPlayers : players;
      const playersByXuid = new Map(players.map((p) => [p.xuid, { gamertag: p.gamertag, teamId: p.teamId }]));
      const metadata = calculateSeriesMetadata(state.matches, state.seriesScore);

      return { teamData, playerData, metadata, orderedPlayers, playersByXuid };
    } catch {
      return null;
    }
  }

  private static computeKillMatrix(
    state: LiveTrackerStateRenderModel | null,
    seriesStatsData: LiveTrackerSeriesStatsData | null,
    analyticsByMatchId: ReadonlyMap<string, MatchAnalytics>,
  ): { allMatchKillMatrix: readonly MatchKillMatrix[]; seriesKillMatrix: KillMatrixResult | null } {
    if (state?.type !== "neatqueue" || seriesStatsData == null || analyticsByMatchId.size === 0) {
      return { allMatchKillMatrix: [], seriesKillMatrix: null };
    }

    const { orderedPlayers: seriesPlayers, playersByXuid } = seriesStatsData;
    const matchKillMatrixRows = new Map<string, ReturnType<KillMatrixFormatter["present"]>>();

    const allMatchKillMatrix = state.matches.map((match) => {
      const analytics = analyticsByMatchId.get(match.matchId);
      if (analytics == null) {
        return {
          matchId: match.matchId,
          pivotData: EMPTY_KILL_MATRIX_PIVOT_DATA,
          transposedPivotData: EMPTY_KILL_MATRIX_PIVOT_DATA,
        };
      }
      const rows = LiveTrackerPresenter.killMatrixFormatter.present({ analytics, playersByXuid });
      matchKillMatrixRows.set(match.matchId, rows);
      return {
        matchId: match.matchId,
        pivotData: KillMatrixFormatter.pivot(rows, seriesPlayers),
        transposedPivotData: KillMatrixFormatter.transpose(rows, seriesPlayers),
      };
    });

    if (matchKillMatrixRows.size === 0) {
      return { allMatchKillMatrix, seriesKillMatrix: null };
    }

    const aggregatedRows = KillMatrixFormatter.aggregate([...matchKillMatrixRows.values()].flatMap((rows) => rows));

    return {
      allMatchKillMatrix,
      seriesKillMatrix: {
        pivotData: KillMatrixFormatter.pivot(aggregatedRows, seriesPlayers),
        transposedPivotData: KillMatrixFormatter.transpose(aggregatedRows, seriesPlayers),
      },
    };
  }

  // Helper function to compare params
  public static areParamsEqual(prev: LiveTrackerParams, curr: LiveTrackerParams): boolean {
    return prev.server === curr.server && prev.queue === curr.queue;
  }

  // Helper function to deeply compare state messages, ignoring timestamps
  public static isStateMessageEqual(prev: LiveTrackerMessage | null, curr: LiveTrackerMessage | null): boolean {
    if (prev === curr) {
      return true;
    }

    if (prev === null || curr === null) {
      return false;
    }

    // Compare meaningful data, excluding timestamps that change every broadcast
    const prevData = prev.data;
    const currData = curr.data;

    // Common fields
    if (prevData.status !== currData.status) {
      return false;
    }

    // Compare rawMatches keys (actual content changes would be caught by match arrays)
    const prevMatchIds = Object.keys(prevData.rawMatches).sort();
    const currMatchIds = Object.keys(currData.rawMatches).sort();
    if (prevMatchIds.length !== currMatchIds.length || !prevMatchIds.every((id, idx) => id === currMatchIds[idx])) {
      return false;
    }

    // Compare playersAssociationData if present
    if ((prevData.playersAssociationData == null) !== (currData.playersAssociationData == null)) {
      return false;
    }

    if (prevData.playersAssociationData != null && currData.playersAssociationData != null) {
      const prevPlayerIds = Object.keys(prevData.playersAssociationData).sort();
      const currPlayerIds = Object.keys(currData.playersAssociationData).sort();
      if (
        prevPlayerIds.length !== currPlayerIds.length ||
        !prevPlayerIds.every((id, idx) => id === currPlayerIds[idx])
      ) {
        return false;
      }

      // Check if any player data changed
      for (const playerId of prevPlayerIds) {
        const prevPlayer = prevData.playersAssociationData[playerId];
        const currPlayer = currData.playersAssociationData[playerId];

        // Compare all player fields except lastRankedGamePlayed timestamp
        if (
          prevPlayer.discordId !== currPlayer.discordId ||
          prevPlayer.discordName !== currPlayer.discordName ||
          prevPlayer.xboxId !== currPlayer.xboxId ||
          prevPlayer.gamertag !== currPlayer.gamertag ||
          prevPlayer.currentRank !== currPlayer.currentRank ||
          prevPlayer.currentRankTier !== currPlayer.currentRankTier ||
          prevPlayer.currentRankSubTier !== currPlayer.currentRankSubTier ||
          prevPlayer.allTimePeakRank !== currPlayer.allTimePeakRank ||
          prevPlayer.esra !== currPlayer.esra ||
          prevPlayer.lastRankedGamePlayed !== currPlayer.lastRankedGamePlayed
        ) {
          return false;
        }
      }
    }

    if (
      prevData.queueNumber !== currData.queueNumber ||
      prevData.guildId !== currData.guildId ||
      prevData.channelId !== currData.channelId ||
      prevData.guildName !== currData.guildName ||
      prevData.seriesScore !== currData.seriesScore ||
      prevData.players.length !== currData.players.length ||
      prevData.teams.length !== currData.teams.length ||
      prevData.substitutions.length !== currData.substitutions.length ||
      prevData.matchSummaries.length !== currData.matchSummaries.length
    ) {
      return false;
    }

    // Compare players by ID (order matters)
    for (let i = 0; i < prevData.players.length; i++) {
      if (
        prevData.players[i].id !== currData.players[i].id ||
        prevData.players[i].discordUsername !== currData.players[i].discordUsername
      ) {
        return false;
      }
    }

    // Compare teams structure
    for (let i = 0; i < prevData.teams.length; i++) {
      const prevTeam = prevData.teams[i];
      const currTeam = currData.teams[i];
      if (
        prevTeam.name !== currTeam.name ||
        prevTeam.playerIds.length !== currTeam.playerIds.length ||
        !prevTeam.playerIds.every((id: string, idx: number) => id === currTeam.playerIds[idx])
      ) {
        return false;
      }
    }

    // Compare substitutions (excluding timestamps if they're the same event)
    for (let i = 0; i < prevData.substitutions.length; i++) {
      const prevSub = prevData.substitutions[i];
      const currSub = currData.substitutions[i];
      if (
        prevSub.playerOutId !== currSub.playerOutId ||
        prevSub.playerInId !== currSub.playerInId ||
        prevSub.teamIndex !== currSub.teamIndex ||
        prevSub.timestamp !== currSub.timestamp
      ) {
        return false;
      }
    }

    // Compare match summaries by matchId and key properties
    for (let i = 0; i < prevData.matchSummaries.length; i++) {
      const prevMatch = prevData.matchSummaries[i];
      const currMatch = currData.matchSummaries[i];
      if (
        prevMatch.matchId !== currMatch.matchId ||
        prevMatch.gameTypeAndMap !== currMatch.gameTypeAndMap ||
        prevMatch.gameScore !== currMatch.gameScore ||
        prevMatch.duration !== currMatch.duration ||
        prevMatch.startTime !== currMatch.startTime ||
        prevMatch.endTime !== currMatch.endTime
      ) {
        return false;
      }
    }

    return true;
  }

  private static parseParamsFromUrl(url: URL): LiveTrackerParams {
    return {
      type: "team",
      server: url.searchParams.get("server") ?? "",
      queue: url.searchParams.get("queue") ?? "",
    };
  }

  private static canConnect(params: LiveTrackerParams): boolean {
    return params.server.length > 0 && params.queue.length > 0;
  }

  private static toIdentity(params: LiveTrackerParams): LiveTrackerIdentity {
    return {
      type: "team",
      guildId: params.server,
      queueNumber: params.queue,
    };
  }

  public start(): void {
    const params = LiveTrackerPresenter.parseParamsFromUrl(this.config.getUrl());

    if (!LiveTrackerPresenter.canConnect(params)) {
      this.config.store.setSnapshot({
        params,
        connectionState: "idle",
        statusText: LiveTrackerPresenter.usageText,
        lastStateMessage: null,
        hasConnection: false,
        hasReceivedInitialData: false,
        analyticsByMatchId: new Map(),
        analyticsStatus: ComponentLoaderStatus.LOADED,
        medalMetadata: {},
        allMatchStats: [],
        seriesStatsData: null,
      });
      return;
    }

    this.disconnect();

    const previous = this.config.store.getSnapshot();
    this.config.store.setSnapshot({
      ...previous,
      params,
      connectionState: "connecting",
      statusText: "Connecting...",
      hasConnection: false,
    });

    void this.connectInternal(LiveTrackerPresenter.toIdentity(params));
  }

  public dispose(): void {
    this.isDisposed = true;
    this.disconnect();
  }

  private disconnect(): void {
    this.stopReconnection();
    this.cleanupConnection();

    this.fetchedMatchIds.clear();

    const current = this.config.store.getSnapshot();
    this.config.store.setSnapshot({
      ...current,
      hasConnection: false,
      lastStateMessage: null,
      hasReceivedInitialData: false,
      analyticsByMatchId: new Map(),
      analyticsStatus: ComponentLoaderStatus.LOADED,
      medalMetadata: {},
      allMatchStats: [],
      seriesStatsData: null,
    });
  }

  private stopReconnection(): void {
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = null;
    }
    this.firstReconnectionTimestamp = null;
    this.reconnectionAttempt = 0;
  }

  private cleanupConnection(): void {
    this.messageSubscription?.unsubscribe();
    this.statusSubscription?.unsubscribe();
    this.messageSubscription = null;
    this.statusSubscription = null;

    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }
  }

  private async connectInternal(identity: LiveTrackerIdentity): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.cleanupConnection();

    const nextConnection = await this.config.liveTrackerService.connect(identity);
    this.connection = nextConnection;

    const current = this.config.store.getSnapshot();
    this.config.store.setSnapshot({
      ...current,
      hasConnection: true,
    });

    this.statusSubscription = nextConnection.subscribeStatus(
      (status: LiveTrackerConnectionStatus, detail?: string): void => {
        if (this.isDisposed) {
          return;
        }

        const snapshot = this.config.store.getSnapshot();

        if (status === "connected") {
          this.stopReconnection();
          this.config.store.setSnapshot({
            ...snapshot,
            connectionState: status,
            statusText: "Connected",
          });
          return;
        }

        if (status === "connecting") {
          this.config.store.setSnapshot({
            ...snapshot,
            connectionState: status,
            statusText: "Connecting...",
          });
          return;
        }

        if (status === "stopped") {
          this.stopReconnection();
          this.config.store.setSnapshot({
            ...snapshot,
            connectionState: status,
            statusText: "Tracker Stopped",
          });
          return;
        }

        if (status === "not_found") {
          this.stopReconnection();
          this.config.store.setSnapshot({
            ...snapshot,
            connectionState: status,
            statusText: "No active tracker found for this queue. Start a tracker first.",
          });
          return;
        }

        this.handleConnectionLost(identity, detail);
      },
    );

    this.messageSubscription = nextConnection.subscribe((message: LiveTrackerMessage): void => {
      if (this.isDisposed) {
        return;
      }

      const snapshot = this.config.store.getSnapshot();

      if (LiveTrackerPresenter.isStateMessageEqual(snapshot.lastStateMessage, message)) {
        return;
      }

      this.stateMessageVersion += 1;
      const version = this.stateMessageVersion;
      void this.handleStateMessageAsync(message, version);
    });
  }

  private async handleStateMessageAsync(message: LiveTrackerMessage, version: number): Promise<void> {
    const currentSnapshot = this.config.store.getSnapshot();
    const stateWithCurrentMetadata = toLiveTrackerStateRenderModel(message, currentSnapshot.medalMetadata);
    const allMatchStatsWithCurrentMetadata = LiveTrackerPresenter.computeAllMatchStats(stateWithCurrentMetadata);
    const seriesStatsDataWithCurrentMetadata =
      LiveTrackerPresenter.computeLiveTrackerSeriesStatsData(stateWithCurrentMetadata);

    const snapshotWithCurrentMetadata: LiveTrackerSnapshot = {
      ...currentSnapshot,
      lastStateMessage: message,
      hasReceivedInitialData: true,
      allMatchStats: allMatchStatsWithCurrentMetadata,
      seriesStatsData: seriesStatsDataWithCurrentMetadata,
    };

    this.config.store.setSnapshot(snapshotWithCurrentMetadata);
    this.triggerAnalyticsFetch(snapshotWithCurrentMetadata);

    const rawMatches = Object.values(message.data.rawMatches).filter((match): match is MatchStats =>
      isMatchStats(match),
    );
    const medalMetadata = await this.config.medalMetadataResolver.getMedalMetadataForMatches(rawMatches);

    if (this.isDisposed || version !== this.stateMessageVersion) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();
    const stateWithResolvedMetadata = toLiveTrackerStateRenderModel(message, medalMetadata);
    const allMatchStatsWithResolvedMetadata = LiveTrackerPresenter.computeAllMatchStats(stateWithResolvedMetadata);
    const seriesStatsDataWithResolvedMetadata =
      LiveTrackerPresenter.computeLiveTrackerSeriesStatsData(stateWithResolvedMetadata);

    const newSnapshot: LiveTrackerSnapshot = {
      ...snapshot,
      lastStateMessage: message,
      hasReceivedInitialData: true,
      medalMetadata,
      allMatchStats: allMatchStatsWithResolvedMetadata,
      seriesStatsData: seriesStatsDataWithResolvedMetadata,
    };

    this.config.store.setSnapshot(newSnapshot);
  }

  private triggerAnalyticsFetch(snapshot: LiveTrackerSnapshot): void {
    const { lastStateMessage } = snapshot;
    if (lastStateMessage == null) {
      return;
    }

    const rawMatchIds = Object.keys(lastStateMessage.data.rawMatches);
    const newMatchIds = rawMatchIds.filter((id) => !this.fetchedMatchIds.has(id));

    if (newMatchIds.length === 0) {
      return;
    }

    const isInitialFetch = this.fetchedMatchIds.size === 0;
    void this.fetchAnalyticsAsync(newMatchIds, isInitialFetch, lastStateMessage);
  }

  private async fetchAnalyticsAsync(
    newMatchIds: string[],
    isInitialFetch: boolean,
    stateMessage: LiveTrackerMessage,
  ): Promise<void> {
    for (const id of newMatchIds) {
      this.fetchedMatchIds.add(id);
    }

    if (isInitialFetch) {
      const current = this.config.store.getSnapshot();
      this.config.store.setSnapshot({
        ...current,
        analyticsStatus: ComponentLoaderStatus.LOADING,
      });
    }

    const chunks: string[][] = [];
    for (let i = 0; i < newMatchIds.length; i += LiveTrackerPresenter.ANALYTICS_BATCH_SIZE) {
      chunks.push(newMatchIds.slice(i, i + LiveTrackerPresenter.ANALYTICS_BATCH_SIZE));
    }

    try {
      const allResults = await Promise.all(
        chunks.map(async (chunk) => this.config.matchAnalyticsService.getBatchMatchAnalytics(chunk)),
      );

      if (this.isDisposed) {
        return;
      }

      const newAnalytics = new Map<string, MatchAnalytics>();
      for (const results of allResults) {
        for (const [matchId, analytics] of Object.entries(results)) {
          if (analytics != null) {
            newAnalytics.set(matchId, analytics);
          }
        }
      }

      const current = this.config.store.getSnapshot();
      if (current.lastStateMessage !== stateMessage) {
        for (const id of newMatchIds) {
          this.fetchedMatchIds.delete(id);
        }
        this.triggerAnalyticsFetch(current);
        return;
      }
      const map = new Map(current.analyticsByMatchId);
      for (const [matchId, analytics] of newAnalytics) {
        map.set(matchId, analytics);
      }
      this.config.store.setSnapshot({
        ...current,
        analyticsByMatchId: map,
        analyticsStatus: ComponentLoaderStatus.LOADED,
      });
    } catch {
      if (this.isDisposed) {
        return;
      }

      for (const id of newMatchIds) {
        this.fetchedMatchIds.delete(id);
      }

      if (isInitialFetch) {
        const current = this.config.store.getSnapshot();
        if (current.lastStateMessage !== stateMessage) {
          return;
        }
        this.config.store.setSnapshot({
          ...current,
          analyticsStatus: ComponentLoaderStatus.ERROR,
        });
      }
    }
  }

  private handleConnectionLost(identity: LiveTrackerIdentity, detail?: string): void {
    const snapshot = this.config.store.getSnapshot();

    // If we've never received initial data, this is likely a "tracker not found" scenario
    // Don't retry in this case
    if (!snapshot.hasReceivedInitialData && this.reconnectionAttempt === 0) {
      this.config.store.setSnapshot({
        ...snapshot,
        connectionState: "not_found",
        statusText: "No active tracker found for this queue. Start a tracker first.",
      });
      this.stopReconnection();
      return;
    }

    const now = Date.now();
    this.firstReconnectionTimestamp ??= now;

    const elapsed = now - this.firstReconnectionTimestamp;

    if (elapsed > this.maxReconnectionDurationMs || this.reconnectionAttempt >= this.maxReconnectionAttempts) {
      const hasDetail = (detail?.length ?? 0) > 0;
      const errorText = hasDetail ? `Connection error: ${detail ?? ""}` : "Connection lost";
      const reason =
        elapsed > this.maxReconnectionDurationMs
          ? "Gave up after 3m"
          : `Max retries reached (${String(this.maxReconnectionAttempts)})`;
      this.config.store.setSnapshot({
        ...snapshot,
        connectionState: "error",
        statusText: `${errorText} (${reason})`,
      });
      this.stopReconnection();
      return;
    }

    const backoffFactor = Math.pow(1.5, this.reconnectionAttempt);
    const delay = Math.min(this.baseReconnectionDelayMs * backoffFactor, 30000); // Cap at 30s
    const jitter = Math.random() * 1000;
    const totalDelay = delay + jitter;

    this.config.store.setSnapshot({
      ...snapshot,
      connectionState: "connecting",
      statusText: `Lost connection, reconnecting... (Attempt ${String(this.reconnectionAttempt + 1)}/${String(this.maxReconnectionAttempts)})`,
    });

    this.reconnectionTimer = setTimeout(() => {
      void this.connectInternal(identity);
      this.reconnectionAttempt++;
    }, totalDelay);
  }
}
