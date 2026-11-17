import type {
  LiveTrackerIdentity,
  LiveTrackerMessage,
  LiveTrackerStateMessage,
  PlayerAssociationData,
} from "@guilty-spark/shared/live-tracker/types";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { ConfiguredTeamContext, SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import type { LivePreSeriesResponse } from "@guilty-spark/shared/contracts/stats/pre-series";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import { isBefore, parseISO } from "date-fns";
import type {
  LiveTrackerConnection,
  LiveTrackerConnectionStatus,
  LiveTrackerService,
  LiveTrackerSubscription,
} from "../../services/live-tracker/types";
import { getReconnectDelayMs } from "../../services/base/reconnect-policy";
import type { SeriesAnalyticsController } from "../../controllers/series-analytics/series-analytics-controller";
import type { SeriesMatchAnalyticsById, SeriesStatsViewModel } from "../series-stats/types";
import type { SeriesMatchesService } from "../../services/series-matches/types";
import type { LivePreSeriesCache } from "../../services/live-pre-series/cache";
import type { LivePreSeriesScope } from "../../services/live-pre-series/types";
import { ComponentLoaderStatus } from "../component-loader/component-loader";
import type { LiveTrackerParams, LiveTrackerSnapshot, LiveTrackerStoreApi } from "./live-tracker-store";
import type {
  LiveTrackerViewModel,
  LiveTrackerMatchRenderModel,
  LiveTrackerMatchSubstitutions,
  LiveTrackerSubstitutionRenderModel,
  LiveTrackerStateRenderModel,
} from "./types";
import { getMatchGameInfo, toLiveTrackerStateRenderModel } from "./state-render-model";

interface Config {
  readonly liveTrackerService: LiveTrackerService;
  readonly getUrl: () => URL;
  readonly store: LiveTrackerStoreApi;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly livePreSeriesCache: LivePreSeriesCache;
  readonly analyticsController: SeriesAnalyticsController;
}

interface SeriesDetailRequest {
  readonly identityKey: string;
  readonly sourceKey: string;
  readonly seriesId: string;
  readonly matchIds: readonly string[];
  readonly teamContext: ConfiguredTeamContext;
}

function createSeriesDetailRequest(message: LiveTrackerStateMessage): SeriesDetailRequest {
  const { data } = message;
  const matchIds = [...data.matchSummaries]
    .sort((left, right) => left.endTime.localeCompare(right.endTime))
    .map((match) => match.matchId);
  const teamContext: ConfiguredTeamContext = {
    teams: data.teams.map((team) => ({ name: team.name, playerIds: [...team.playerIds] })),
    playersAssociationData: Object.fromEntries(
      Object.entries(data.playersAssociationData ?? {}).map(([playerId, association]) => [
        playerId,
        { xboxId: association.xboxId },
      ]),
    ),
    substitutions: data.substitutions.map(({ playerOutId, playerInId, teamIndex, timestamp }) => ({
      playerOutId,
      playerInId,
      teamIndex,
      timestamp,
    })),
  };
  const identityKey = `${data.guildId}:${data.queueNumber.toString()}`;
  const sourceKey = JSON.stringify([identityKey, matchIds, teamContext]);

  return {
    identityKey,
    sourceKey,
    seriesId: `guild:${data.guildId}/queue/${data.queueNumber.toString()}`,
    matchIds,
    teamContext,
  };
}

function getMedalMetadata(detail: SeriesDetailResponse | null): MedalMetadata {
  const metadata: MedalMetadata = {};
  for (const result of detail?.matches.results ?? []) {
    if (result.status !== "resolved") {
      continue;
    }
    const medals = result.detail.teams.flatMap((team) => [
      ...team.medals,
      ...result.detail.players.flatMap((player) =>
        player.teamStats.filter((stats) => stats.matchTeamId === team.matchTeamId).flatMap((stats) => stats.medals),
      ),
    ]);
    for (const medal of medals) {
      metadata[medal.id] = {
        name: medal.name ?? medal.id.toString(),
        sortingWeight: medal.sortingWeight ?? 0,
      };
    }
  }
  return metadata;
}

function withDetailScores(
  state: LiveTrackerStateRenderModel | null,
  detail: SeriesStatsViewModel | null,
  response: SeriesDetailResponse | null,
): LiveTrackerStateRenderModel | null {
  if (state == null || detail == null || response == null) {
    return state;
  }
  const mappedIds = new Set(
    response.matches.results
      .filter(
        (result) =>
          result.status === "resolved" &&
          result.detail.teams.length > 0 &&
          result.detail.teams.every((team) => team.seriesTeamId != null),
      )
      .map((result) => result.matchId),
  );
  const scores = new Map(
    detail.matchSummaries.filter((match) => mappedIds.has(match.matchId)).map((match) => [match.matchId, match]),
  );
  const hasCurrentMatches =
    response.matches.matchIds.length === state.matches.length &&
    response.matches.matchIds.every((matchId, index) => state.matches[index]?.matchId === matchId);
  return {
    ...state,
    seriesScore: detail.seriesStats == null || !hasCurrentMatches ? state.seriesScore : detail.seriesScore,
    matches: state.matches.map((match) => {
      const score = scores.get(match.matchId);
      return score == null ? match : { ...match, gameScore: score.gameScore, gameSubScore: score.gameSubScore };
    }),
  };
}

function toCapturedPreSeriesPlayers(
  message: LiveTrackerStateMessage,
  response: LivePreSeriesResponse | null,
): Record<string, PlayerAssociationData> | null {
  const { data } = message;
  if (
    response?.status !== "resolved" ||
    response.guildId !== data.guildId ||
    response.queueNumber !== data.queueNumber ||
    response.seriesStartedAt !== data.seriesStartedAt
  ) {
    return null;
  }

  const capturedPlayers = new Map(response.players.map((player) => [player.playerId, player.captured] as const));
  const playersAssociationData: Record<string, PlayerAssociationData> = {};
  for (const team of data.teams) {
    for (const playerId of team.playerIds) {
      const currentPlayer = Preconditions.checkExists(
        data.players.find((player) => player.id === playerId),
        `Missing player '${playerId}' from state players list`,
      );
      const captured = capturedPlayers.get(playerId);
      if (captured != null) {
        playersAssociationData[playerId] = captured;
      } else {
        playersAssociationData[playerId] = {
          discordId: data.playersAssociationData?.[playerId]?.discordId ?? "",
          discordName: currentPlayer.discordUsername,
          xboxId: null,
          gamertag: null,
          currentRank: null,
          currentRankTier: null,
          currentRankSubTier: null,
          currentRankMeasurementMatchesRemaining: null,
          currentRankInitialMeasurementMatches: null,
          allTimePeakRank: null,
          esra: null,
          lastRankedGamePlayed: null,
        };
      }
    }
  }
  return playersAssociationData;
}

function createLivePreSeriesScope(message: LiveTrackerStateMessage): LivePreSeriesScope | null {
  const { data } = message;
  if (data.seriesStartedAt == null) {
    return null;
  }
  const rosterIdentity = {
    players: data.players.map(({ id, discordUsername }) => [id, discordUsername]),
    teams: data.teams.map(({ name, playerIds }) => [name, playerIds]),
    substitutions: data.substitutions,
    associations: Object.entries(data.playersAssociationData ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([playerId, association]) => [playerId, association.discordId, association.xboxId]),
  };
  return {
    guildId: data.guildId,
    queueNumber: data.queueNumber.toString(),
    seriesStartedAt: data.seriesStartedAt,
    rosterRevision: JSON.stringify(rosterIdentity),
  };
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
  private connectionGeneration = 0;
  private readonly maxReconnectionAttempts = 10;
  private readonly maxReconnectionDurationMs = 3 * 60 * 1000;

  private stateMessageVersion = 0;
  private detailRequestGeneration = 0;
  private detailSourceKey: string | null = null;
  private detailIdentityKey: string | null = null;
  private livePreSeriesSourceKey: string | null = null;
  private livePreSeriesSubstitutionsKey: string | null = null;
  private livePreSeriesRequestGeneration = 0;

  public constructor(config: Config) {
    this.config = config;
  }

  public static present(snapshot: LiveTrackerSnapshot, detailModel: SeriesStatsViewModel | null): LiveTrackerViewModel {
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

    const medalMetadata = getMedalMetadata(snapshot.seriesDetail);
    const state = withDetailScores(
      lastStateMessage?.type === "state" ? toLiveTrackerStateRenderModel(lastStateMessage, medalMetadata) : null,
      detailModel,
      snapshot.seriesDetail,
    );
    const substitutions = state?.type === "neatqueue" ? state.substitutions : [];
    const renderedMatchIds = new Set(detailModel?.matchDetails.map((match) => match.matchId));
    const sortedSubstitutions = [...substitutions].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const availablePlayers =
      state?.type === "neatqueue"
        ? state.teams.flatMap((team) => team.players.map((player) => ({ id: player.id, name: player.displayName })))
        : [];
    const allMatchStats = detailModel?.matchDetails.map(({ matchId, data }) => ({ matchId, data })) ?? [];
    const seriesStats =
      detailModel?.seriesStats == null
        ? null
        : {
            teamData: detailModel.seriesStats.teamData,
            playerData: detailModel.seriesStats.playerData,
            metadata: detailModel.seriesStats.metadata,
          };
    const allMatchKillMatrix =
      detailModel?.matchDetails.map((detail) => ({
        matchId: detail.matchId,
        pivotData: detail.killMatrixPivotData,
        transposedPivotData: detail.transposedKillMatrixPivotData,
        crossTeamData: detail.crossTeamKillMatrixData,
        swappedCrossTeamData: detail.swappedCrossTeamKillMatrixData,
      })) ?? [];
    const seriesKillMatrix =
      detailModel?.seriesStats == null
        ? null
        : {
            pivotData: detailModel.seriesStats.killMatrixPivotData,
            transposedPivotData: detailModel.seriesStats.transposedKillMatrixPivotData,
            crossTeamData: detailModel.seriesStats.crossTeamKillMatrixData,
            swappedCrossTeamData: detailModel.seriesStats.swappedCrossTeamKillMatrixData,
          };
    const analyticsStatus = detailModel?.seriesStats?.killMatrixStatus ?? ComponentLoaderStatus.PENDING;

    return {
      title,
      subtitle,
      statusText,
      statusClassName,
      iconUrl,
      state,
      sortedSubstitutions,
      matchSubstitutions: LiveTrackerPresenter.groupMatchSubstitutions(
        state?.matches.filter((match) => renderedMatchIds.has(match.matchId)) ?? [],
        sortedSubstitutions,
      ),
      availablePlayers,
      params,
      seriesDetail: snapshot.seriesDetail,
      seriesDetailStatus: snapshot.seriesDetailStatus,
      seriesDetailError: snapshot.seriesDetailError,
      seriesAnalyticsByMatchId: snapshot.seriesAnalyticsByMatchId,
      detailViewModel: detailModel,
      allMatchStats,
      seriesStats,
      analyticsStatus,
      allMatchKillMatrix,
      seriesKillMatrix,
      livePreSeriesPlayersAssociationData:
        lastStateMessage?.type === "state"
          ? toCapturedPreSeriesPlayers(lastStateMessage, snapshot.livePreSeriesResponse)
          : null,
      livePreSeriesStatus: snapshot.livePreSeriesStatus,
      livePreSeriesError: snapshot.livePreSeriesError,
    };
  }

  private static groupMatchSubstitutions(
    matches: readonly LiveTrackerMatchRenderModel[],
    substitutions: readonly LiveTrackerSubstitutionRenderModel[],
  ): LiveTrackerMatchSubstitutions {
    const byMatchId = new Map<string, readonly LiveTrackerSubstitutionRenderModel[]>();
    let next = 0;
    for (const match of matches) {
      const before: LiveTrackerSubstitutionRenderModel[] = [];
      while (next < substitutions.length) {
        const substitution = substitutions[next];
        if (isBefore(parseISO(match.endTime), parseISO(substitution.timestamp))) {
          break;
        }
        before.push(substitution);
        next += 1;
      }
      byMatchId.set(match.matchId, before);
    }
    return { byMatchId, trailing: substitutions.slice(next) };
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
    if (prevData.seriesStartedAt !== currData.seriesStartedAt) {
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
      const prevGameInfo = getMatchGameInfo(prevMatch, prevData.rawMatches);
      const currGameInfo = getMatchGameInfo(currMatch, currData.rawMatches);
      if (
        prevMatch.matchId !== currMatch.matchId ||
        prevMatch.gameTypeAndMap !== currMatch.gameTypeAndMap ||
        prevMatch.gameType !== currMatch.gameType ||
        prevMatch.gameMap !== currMatch.gameMap ||
        prevMatch.gameMapThumbnailUrl !== currMatch.gameMapThumbnailUrl ||
        prevMatch.gameScore !== currMatch.gameScore ||
        prevMatch.duration !== currMatch.duration ||
        prevMatch.startTime !== currMatch.startTime ||
        prevMatch.endTime !== currMatch.endTime ||
        prevGameInfo?.mapAssetId !== currGameInfo?.mapAssetId ||
        prevGameInfo?.mapVersionId !== currGameInfo?.mapVersionId ||
        prevGameInfo?.gameVariantCategory !== currGameInfo?.gameVariantCategory
      ) {
        return false;
      }
    }

    if (
      JSON.stringify(prevData.matchSummaries.map((match) => match.playerXuidToGametag)) !==
      JSON.stringify(currData.matchSummaries.map((match) => match.playerXuidToGametag))
    ) {
      return false;
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
      this.connectionGeneration += 1;
      this.cleanupConnection();
      this.config.analyticsController.reset();
      this.detailRequestGeneration += 1;
      this.detailSourceKey = null;
      this.detailIdentityKey = null;
      this.livePreSeriesRequestGeneration += 1;
      this.livePreSeriesSourceKey = null;
      this.livePreSeriesSubstitutionsKey = null;
      this.config.livePreSeriesCache.invalidateRoster();
      this.config.store.setSnapshot({
        params,
        connectionState: "idle",
        statusText: LiveTrackerPresenter.usageText,
        lastStateMessage: null,
        hasConnection: false,
        hasReceivedInitialData: false,
        seriesDetail: null,
        seriesDetailStatus: ComponentLoaderStatus.PENDING,
        seriesDetailError: null,
        livePreSeriesResponse: null,
        livePreSeriesStatus: ComponentLoaderStatus.PENDING,
        livePreSeriesError: null,
        seriesAnalyticsByMatchId: new Map(),
      });
      return;
    }

    const previous = this.config.store.getSnapshot();
    const changedIdentity = !LiveTrackerPresenter.areParamsEqual(previous.params, params);
    this.connectionGeneration += 1;
    this.cleanupConnection();
    this.stopReconnection();
    if (changedIdentity) {
      this.detailRequestGeneration += 1;
      this.detailSourceKey = null;
      this.detailIdentityKey = null;
      this.livePreSeriesRequestGeneration += 1;
      this.livePreSeriesSourceKey = null;
      this.livePreSeriesSubstitutionsKey = null;
      this.config.livePreSeriesCache.invalidateRoster();
      this.config.analyticsController.reset();
    }
    const current = this.config.store.getSnapshot();
    this.config.store.setSnapshot({
      ...current,
      params,
      connectionState: "connecting",
      statusText: "Connecting...",
      hasConnection: false,
      ...(changedIdentity
        ? {
            lastStateMessage: null,
            hasReceivedInitialData: false,
            seriesDetail: null,
            seriesDetailStatus: ComponentLoaderStatus.PENDING,
            seriesDetailError: null,
            livePreSeriesResponse: null,
            livePreSeriesStatus: ComponentLoaderStatus.PENDING,
            livePreSeriesError: null,
          }
        : {}),
    });

    void this.connectInternal(LiveTrackerPresenter.toIdentity(params), this.connectionGeneration);
  }

  public dispose(): void {
    this.isDisposed = true;
    this.connectionGeneration += 1;
    this.detailRequestGeneration += 1;
    this.livePreSeriesRequestGeneration += 1;
    this.stopReconnection();
    this.cleanupConnection();
    this.config.analyticsController.dispose();
  }

  public loadAnalytics(module: AnalyticsModule, matchId?: string): void {
    this.config.analyticsController.load(module, matchId);
  }

  public setAnalytics(analyticsByMatchId: SeriesMatchAnalyticsById): void {
    if (this.isDisposed) {
      return;
    }
    const current = this.config.store.getSnapshot();
    this.config.store.setSnapshot({ ...current, seriesAnalyticsByMatchId: analyticsByMatchId });
  }

  public retrySeriesDetails(): void {
    const message = this.config.store.getSnapshot().lastStateMessage;
    if (message?.type !== "state" || this.isDisposed) {
      return;
    }
    const request = createSeriesDetailRequest(message);
    this.detailSourceKey = request.sourceKey;
    this.config.analyticsController.updateMatchIds(request.matchIds);
    this.detailRequestGeneration += 1;
    this.beginSeriesDetailRequest(request, this.config.store.getSnapshot().seriesDetail != null);
  }

  public retryLivePreSeries(): void {
    const message = this.config.store.getSnapshot().lastStateMessage;
    const scope = message?.type === "state" ? createLivePreSeriesScope(message) : null;
    if (scope == null || this.isDisposed) {
      return;
    }
    const key = JSON.stringify([scope.guildId, scope.queueNumber, scope.seriesStartedAt, scope.rosterRevision]);
    this.livePreSeriesSourceKey = key;
    this.config.livePreSeriesCache.invalidateRoster();
    this.loadLivePreSeries(scope, key);
  }

  private updateLivePreSeries(message: LiveTrackerStateMessage): void {
    const scope = createLivePreSeriesScope(message);
    if (scope == null) {
      if (this.livePreSeriesSourceKey != null) {
        this.livePreSeriesRequestGeneration += 1;
        this.livePreSeriesSourceKey = null;
        this.livePreSeriesSubstitutionsKey = null;
        const current = this.config.store.getSnapshot();
        this.config.store.setSnapshot({
          ...current,
          livePreSeriesResponse: null,
          livePreSeriesStatus: ComponentLoaderStatus.PENDING,
          livePreSeriesError: null,
        });
      }
      return;
    }

    const key = JSON.stringify([scope.guildId, scope.queueNumber, scope.seriesStartedAt, scope.rosterRevision]);
    const substitutionsKey = JSON.stringify(message.data.substitutions);
    if (key === this.livePreSeriesSourceKey && substitutionsKey === this.livePreSeriesSubstitutionsKey) {
      return;
    }

    const substitutionsChanged =
      this.livePreSeriesSubstitutionsKey != null && substitutionsKey !== this.livePreSeriesSubstitutionsKey;
    this.livePreSeriesSourceKey = key;
    this.livePreSeriesSubstitutionsKey = substitutionsKey;
    if (substitutionsChanged && message.data.status !== "stopped") {
      this.config.livePreSeriesCache.invalidateRoster();
    }

    if (message.data.status === "stopped") {
      this.livePreSeriesRequestGeneration += 1;
      const current = this.config.store.getSnapshot();
      const retainedResponse = this.getRetainedPreSeriesResponse(current.livePreSeriesResponse, scope);
      const hasRetainedResponse = retainedResponse != null;
      this.config.store.setSnapshot({
        ...current,
        livePreSeriesResponse: retainedResponse,
        livePreSeriesStatus: hasRetainedResponse ? ComponentLoaderStatus.LOADED : ComponentLoaderStatus.ERROR,
        livePreSeriesError: hasRetainedResponse
          ? null
          : "Captured player info was not loaded before the series stopped.",
      });
      return;
    }

    this.loadLivePreSeries(scope, key);
  }

  private getRetainedPreSeriesResponse(
    response: LivePreSeriesResponse | null,
    scope: LivePreSeriesScope,
  ): LivePreSeriesResponse | null {
    if (
      response?.status === "resolved" &&
      response.guildId === scope.guildId &&
      response.queueNumber.toString() === scope.queueNumber &&
      response.seriesStartedAt === scope.seriesStartedAt
    ) {
      return response;
    }
    return null;
  }

  private loadLivePreSeries(scope: LivePreSeriesScope, key: string): void {
    this.livePreSeriesRequestGeneration += 1;
    const generation = this.livePreSeriesRequestGeneration;
    const current = this.config.store.getSnapshot();
    this.config.store.setSnapshot({
      ...current,
      livePreSeriesResponse: this.getRetainedPreSeriesResponse(current.livePreSeriesResponse, scope),
      livePreSeriesStatus: ComponentLoaderStatus.LOADING,
      livePreSeriesError: null,
    });
    void this.fetchLivePreSeriesAsync(scope, key, generation);
  }

  private async fetchLivePreSeriesAsync(scope: LivePreSeriesScope, key: string, generation: number): Promise<void> {
    try {
      const response = await this.config.livePreSeriesCache.load(scope);
      if (response.status !== "resolved") {
        throw new Error("Captured player info is not available for this live series.");
      }
      if (
        response.guildId !== scope.guildId ||
        response.queueNumber.toString() !== scope.queueNumber ||
        response.seriesStartedAt !== scope.seriesStartedAt
      ) {
        throw new Error("Captured player info belongs to a different live series.");
      }
      if (!this.isLivePreSeriesRequestCurrent(key, generation)) {
        return;
      }
      const current = this.config.store.getSnapshot();
      this.config.store.setSnapshot({
        ...current,
        livePreSeriesResponse: response,
        livePreSeriesStatus: ComponentLoaderStatus.LOADED,
        livePreSeriesError: null,
      });
    } catch (error) {
      if (!this.isLivePreSeriesRequestCurrent(key, generation)) {
        return;
      }
      const current = this.config.store.getSnapshot();
      this.config.store.setSnapshot({
        ...current,
        livePreSeriesStatus: ComponentLoaderStatus.ERROR,
        livePreSeriesError: error instanceof Error ? error.message : "Unable to load captured player info",
      });
    }
  }

  private isLivePreSeriesRequestCurrent(key: string, generation: number): boolean {
    return (
      !this.isDisposed && generation === this.livePreSeriesRequestGeneration && key === this.livePreSeriesSourceKey
    );
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

  private async connectInternal(identity: LiveTrackerIdentity, generation: number): Promise<void> {
    if (!this.isConnectionGenerationCurrent(generation)) {
      return;
    }

    this.cleanupConnection();

    const nextConnection = await this.config.liveTrackerService.connect(identity);
    if (!this.isConnectionGenerationCurrent(generation)) {
      nextConnection.disconnect();
      return;
    }
    this.connection = nextConnection;

    const current = this.config.store.getSnapshot();
    this.config.store.setSnapshot({
      ...current,
      hasConnection: true,
    });

    this.statusSubscription = nextConnection.subscribeStatus(
      (status: LiveTrackerConnectionStatus, detail?: string): void => {
        if (!this.isConnectionGenerationCurrent(generation)) {
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
      if (!this.isConnectionGenerationCurrent(generation)) {
        return;
      }

      const snapshot = this.config.store.getSnapshot();

      if (LiveTrackerPresenter.isStateMessageEqual(snapshot.lastStateMessage, message)) {
        return;
      }

      this.stateMessageVersion += 1;
      const version = this.stateMessageVersion;
      this.handleStateMessage(message, version);
    });
  }

  private handleStateMessage(message: LiveTrackerStateMessage, version: number): void {
    if (this.isDisposed || version !== this.stateMessageVersion) {
      return;
    }

    const request = createSeriesDetailRequest(message);
    const currentSnapshot = this.config.store.getSnapshot();
    const previousMessage = currentSnapshot.lastStateMessage;
    const previousRequest = previousMessage == null ? null : createSeriesDetailRequest(previousMessage);
    const retainDetail =
      currentSnapshot.seriesDetail != null &&
      previousRequest?.identityKey === request.identityKey &&
      JSON.stringify(previousRequest.teamContext) === JSON.stringify(request.teamContext) &&
      previousRequest.matchIds.every((matchId, index) => request.matchIds[index] === matchId);
    this.config.store.setSnapshot({
      ...currentSnapshot,
      lastStateMessage: message,
      hasReceivedInitialData: true,
    });
    this.updateLivePreSeries(message);

    if (request.sourceKey === this.detailSourceKey) {
      return;
    }

    const identityChanged = this.detailIdentityKey !== request.identityKey;
    this.detailIdentityKey = request.identityKey;
    this.detailSourceKey = request.sourceKey;
    this.detailRequestGeneration += 1;
    if (identityChanged) {
      this.config.analyticsController.reset(request.matchIds);
    } else {
      this.config.analyticsController.updateMatchIds(request.matchIds);
    }

    if (request.matchIds.length === 0) {
      const current = this.config.store.getSnapshot();
      this.config.store.setSnapshot({
        ...current,
        seriesDetail: null,
        seriesDetailStatus: ComponentLoaderStatus.PENDING,
        seriesDetailError: null,
      });
      return;
    }

    this.beginSeriesDetailRequest(request, retainDetail);
  }

  private isConnectionGenerationCurrent(generation: number): boolean {
    return !this.isDisposed && generation === this.connectionGeneration;
  }

  private beginSeriesDetailRequest(request: SeriesDetailRequest, retainDetail = false): void {
    const generation = this.detailRequestGeneration;
    const current = this.config.store.getSnapshot();
    this.config.store.setSnapshot({
      ...current,
      seriesDetail: retainDetail ? current.seriesDetail : null,
      seriesDetailStatus: ComponentLoaderStatus.LOADING,
      seriesDetailError: null,
    });
    void this.fetchSeriesDetailAsync(request, generation);
  }

  private async fetchSeriesDetailAsync(request: SeriesDetailRequest, generation: number): Promise<void> {
    try {
      const response = await this.config.seriesMatchesService.getSeriesDetail(
        request.seriesId,
        request.matchIds,
        undefined,
        undefined,
        request.teamContext,
      );
      if (this.isDisposed || generation !== this.detailRequestGeneration) {
        return;
      }
      this.setSeriesDetail(response);
    } catch (error) {
      if (this.isDisposed || generation !== this.detailRequestGeneration) {
        return;
      }
      const current = this.config.store.getSnapshot();
      this.config.store.setSnapshot({
        ...current,
        seriesDetailStatus: ComponentLoaderStatus.ERROR,
        seriesDetailError: error instanceof Error ? error.message : "Unable to load series stats",
      });
    }
  }

  private setSeriesDetail(response: SeriesDetailResponse): void {
    const current = this.config.store.getSnapshot();
    const hasFetchFailures = response.matches.results.some(
      (result) => result.status === "unavailable" && result.reason === "fetch-failed",
    );
    this.config.store.setSnapshot({
      ...current,
      seriesDetail: hasFetchFailures ? (current.seriesDetail ?? response) : response,
      seriesDetailStatus: hasFetchFailures ? ComponentLoaderStatus.ERROR : ComponentLoaderStatus.LOADED,
      seriesDetailError: hasFetchFailures ? "Unable to load some match details" : null,
    });
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

    if (this.reconnectionTimer != null) {
      return;
    }

    const now = Date.now();
    this.firstReconnectionTimestamp ??= now;

    const limitReason = this.getReconnectionLimitReason(now);
    if (limitReason != null) {
      this.setReconnectionError(snapshot, detail, limitReason);
      return;
    }

    const totalDelay = getReconnectDelayMs(this.reconnectionAttempt);

    this.config.store.setSnapshot({
      ...snapshot,
      connectionState: "connecting",
      statusText: `Lost connection, reconnecting... (Attempt ${String(this.reconnectionAttempt + 1)}/${String(this.maxReconnectionAttempts)})`,
    });

    this.reconnectionTimer = setTimeout(() => {
      const retryNow = Date.now();
      const retryLimitReason = this.getReconnectionLimitReason(retryNow);
      if (retryLimitReason != null) {
        const currentSnapshot = this.config.store.getSnapshot();
        this.setReconnectionError(currentSnapshot, detail, retryLimitReason);
        return;
      }

      this.reconnectionTimer = null;
      void this.connectInternal(identity, this.connectionGeneration);
      this.reconnectionAttempt++;
    }, totalDelay);
  }

  private getReconnectionLimitReason(now: number): string | null {
    const elapsed = now - (this.firstReconnectionTimestamp ?? now);
    if (elapsed > this.maxReconnectionDurationMs) {
      return "Gave up after 3m";
    }

    if (this.reconnectionAttempt >= this.maxReconnectionAttempts) {
      return `Max retries reached (${String(this.maxReconnectionAttempts)})`;
    }

    return null;
  }

  private setReconnectionError(snapshot: LiveTrackerSnapshot, detail: string | undefined, reason: string): void {
    const hasDetail = (detail?.length ?? 0) > 0;
    const errorText = hasDetail ? `Connection error: ${detail ?? ""}` : "Connection lost";
    this.config.store.setSnapshot({
      ...snapshot,
      connectionState: "error",
      statusText: `${errorText} (${reason})`,
    });
    this.stopReconnection();
  }
}
