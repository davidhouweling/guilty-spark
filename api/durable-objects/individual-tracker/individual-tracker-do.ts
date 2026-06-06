import * as Sentry from "@sentry/cloudflare";
import { addMilliseconds, compareAsc, differenceInHours } from "date-fns";
import { type HaloInfiniteClient, type MatchStats, MatchType, RequestError } from "halo-infinite-api";
import { trackerViewMessageContract } from "@guilty-spark/shared/contracts/individual-tracker/view";
import {
  analyzeMatchGroupings,
  buildMatchScore,
  buildTeamRosterSignature,
  getMatchOutcomeLabel,
} from "@guilty-spark/shared/halo/match-enrichment";
import { computeSeriesTeamWins } from "@guilty-spark/shared/halo/series-score";
import {
  buildSeriesGroupKey,
  getDefaultSeriesGroupSubtitle,
  getDefaultSeriesGroupTitle,
} from "@guilty-spark/shared/individual-tracker/series-grouping";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { type IndividualTopBarStatOption } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { LogService } from "../../services/log/types";
import { installServices as installServicesImpl, type Services } from "../../services/install";
import {
  CloudflareWebSocketHibernationAdapter,
  type WebSocketHibernationAdapter,
} from "../../base/websocket-hibernation-adapter";
import type {
  IndividualTrackerStartRequest,
  IndividualTrackerInternalState,
  IndividualTrackerMatchSummary,
  IndividualTrackerSeriesGroup,
  IndividualTrackerState,
  IndividualTrackerStartResponse,
  IndividualTrackerPauseResponse,
  IndividualTrackerResumeResponse,
  IndividualTrackerStopResponse,
  IndividualTrackerStatusResponse,
  IndividualTrackerViewState,
  IndividualTrackerViewStateResponse,
  IndividualTrackerSelectMatchesRequest,
  IndividualTrackerSelectMatchesResponse,
  TopBarStatItem,
} from "./types";
import { accumulatePlayerStats, computeTopBarStats, getActiveMatchIds } from "./top-bar-stats";

const DISPLAY_INTERVAL_MS = 3 * 60 * 1000;
const EXECUTION_BUFFER_MS = 8 * 1000;
const ALARM_INTERVAL_MS = DISPLAY_INTERVAL_MS - EXECUTION_BUFFER_MS;

const NORMAL_INTERVAL_MINUTES = 3;
const CONSECUTIVE_ERROR_INTERVAL_MINUTES = 5;
const MAX_BACKOFF_INTERVAL_MINUTES = 10;

const PLAYER_MATCHES_PAGE_SIZE = 25;

const STATE_STORAGE_KEY = "individualTrackerState";

export class IndividualTrackerDO implements DurableObject, Rpc.DurableObjectBranded {
  __DURABLE_OBJECT_BRAND = undefined as never;
  private readonly state: DurableObjectState;
  private readonly services: Services;
  private readonly logService: LogService;
  private ownerClient: HaloInfiniteClient | null = null;
  private readonly webSocketAdapter: WebSocketHibernationAdapter;
  private topBarStatsCacheKey: string | undefined;
  private cachedTopBarStats: readonly TopBarStatItem[] | undefined;
  private cachedResolvedRosterCount: number | undefined;

  constructor(
    state: DurableObjectState,
    env: Env,
    installServices = installServicesImpl,
    webSocketAdapter: WebSocketHibernationAdapter = new CloudflareWebSocketHibernationAdapter(),
  ) {
    this.state = state;

    this.services = installServices({ env });
    this.logService = this.services.logService;
    this.webSocketAdapter = webSocketAdapter;
  }

  async fetch(request: Request): Promise<Response> {
    return await Sentry.withScope(async () => {
      const url = new URL(request.url);
      const action = url.pathname.split("/").pop();

      Sentry.setTag("durableObject", "IndividualTrackerDO");
      Sentry.setTag("action", action ?? "unknown");
      Sentry.setContext("request", {
        url: request.url,
        method: request.method,
      });

      try {
        switch (action) {
          case "start": {
            return await this.handleStart(request);
          }
          case "pause": {
            return await this.handlePause();
          }
          case "resume": {
            return await this.handleResume();
          }
          case "stop": {
            return await this.handleStop();
          }
          case "status": {
            return await this.handleStatus();
          }
          case "view-state": {
            return await this.handleViewState(request);
          }
          case "select-matches": {
            return await this.handleSelectMatches(request);
          }
          case "websocket": {
            return await this.handleWebSocket(request);
          }
          case undefined: {
            return new Response("Bad Request", { status: 400 });
          }
          default: {
            return new Response("Not Found", { status: 404 });
          }
        }
      } catch (error) {
        this.logService.error("IndividualTrackerDO fetch error:", new Map([["error", String(error)]]));
        Sentry.captureException(error);
        return new Response("Internal Server Error", { status: 500 });
      }
    });
  }

  async alarm(): Promise<void> {
    await Sentry.withScope(async () => {
      Sentry.setTag("durableObject", "IndividualTrackerDO");
      Sentry.setTag("method", "alarm");

      const trackerState = await this.getState();
      if (trackerState == null || trackerState.isPaused || trackerState.status !== "active") {
        return;
      }

      Sentry.setContext("trackerState", {
        userId: trackerState.userId,
        trackerId: trackerState.trackerId,
        gamertag: trackerState.gamertag,
        checkCount: trackerState.checkCount,
        errorCount: trackerState.errorState.consecutiveErrors,
      });

      const lastActivity = new Date(
        Math.max(
          new Date(trackerState.startTime).getTime(),
          trackerState.lastMatchDiscoveredAt == null
            ? new Date(trackerState.startTime).getTime()
            : new Date(trackerState.lastMatchDiscoveredAt).getTime(),
        ),
      );
      if (differenceInHours(new Date(), lastActivity) >= trackerState.idleTimeoutHours) {
        trackerState.status = "stopped";
        trackerState.lastUpdateTime = new Date().toISOString();
        await this.state.storage.deleteAlarm();
        await this.setState(trackerState);
        this.broadcastViewState(trackerState);
        this.closeWebSockets("Tracker idle timeout");
        await this.markRegistryStopped(trackerState);
        return;
      }

      let discoveredNewMatch = false;
      try {
        discoveredNewMatch = await this.poll(trackerState);
      } catch (error) {
        this.logService.error("IndividualTracker: alarm poll failed", new Map([["error", String(error)]]));
        Sentry.captureException(error);
        this.handleError(trackerState, error);
      }

      await this.setState(trackerState);
      if (discoveredNewMatch) {
        this.broadcastViewState(trackerState);
      }
      await this.state.storage.setAlarm(addMilliseconds(new Date(), this.getNextAlarmInterval(trackerState)).getTime());
    });
  }

  private async poll(trackerState: IndividualTrackerInternalState): Promise<boolean> {
    const haloClient = await this.getOwnerClient(trackerState.userId);

    let matches: Awaited<ReturnType<HaloInfiniteClient["getPlayerMatches"]>>;
    try {
      matches = await haloClient.getPlayerMatches(trackerState.xuid, MatchType.All, PLAYER_MATCHES_PAGE_SIZE);
    } catch (error) {
      if (this.isAuthError(error)) {
        this.ownerClient = null;
      }
      throw error;
    }

    const searchStart = new Date(trackerState.searchStartTime);
    let discoveredNewMatch = false;
    let viewChanged = false;
    const newlyDiscovered = new Set<string>();
    for (const match of matches) {
      const matchId = match.MatchId;
      if (trackerState.matchIds.includes(matchId)) {
        continue;
      }
      if (new Date(match.MatchInfo.StartTime) < searchStart) {
        continue;
      }

      const outcome = getMatchOutcomeLabel(match.Outcome);
      const mapName = await this.resolveMapName(
        match.MatchInfo.MapVariant.AssetId,
        match.MatchInfo.MapVariant.VersionId,
      );
      const summary: IndividualTrackerMatchSummary = {
        matchId,
        startTime: match.MatchInfo.StartTime,
        endTime: match.MatchInfo.EndTime,
        mapAssetId: match.MatchInfo.MapVariant.AssetId,
        mapVersionId: match.MatchInfo.MapVariant.VersionId,
        mapName,
        modeAssetId: match.MatchInfo.UgcGameVariant.AssetId,
        gameVariantCategory: match.MatchInfo.GameVariantCategory,
        outcome,
        score: "",
        isMatchmaking: match.MatchInfo.Playlist != null,
        teamRosterSignature: null,
        teamOutcomes: null,
      };
      await this.enrichScore(haloClient, summary, trackerState);
      trackerState.discoveredMatches[matchId] = summary;
      trackerState.matchIds.push(matchId);
      if (trackerState.selectedMatchIds.length > 0) {
        const durationSeconds = getDurationInSeconds(match.MatchInfo.Duration);
        if (durationSeconds >= 120) {
          trackerState.selectedMatchIds = [...trackerState.selectedMatchIds, matchId].sort();
        }
      }
      newlyDiscovered.add(matchId);
      discoveredNewMatch = true;
    }

    for (const matchId of trackerState.matchIds) {
      if (newlyDiscovered.has(matchId)) {
        continue;
      }
      const summary = trackerState.discoveredMatches[matchId];
      if (summary == null) {
        continue;
      }

      if (summary.teamOutcomes === null) {
        const enriched = await this.enrichScore(haloClient, summary, trackerState);
        if (enriched) {
          viewChanged = true;
        }
      }

      if (summary.mapName === "") {
        const mapName = await this.resolveMapName(summary.mapAssetId, summary.mapVersionId);
        if (mapName !== "") {
          summary.mapName = mapName;
          viewChanged = true;
        }
      }
    }

    const now = new Date().toISOString();
    if (discoveredNewMatch) {
      trackerState.lastMatchDiscoveredAt = now;
    }
    if (viewChanged) {
      discoveredNewMatch = true;
    }

    trackerState.checkCount += 1;
    trackerState.lastUpdateTime = now;
    trackerState.errorState.consecutiveErrors = 0;
    trackerState.errorState.backoffMinutes = NORMAL_INTERVAL_MINUTES;
    trackerState.errorState.lastSuccessTime = now;
    trackerState.errorState.lastErrorMessage = undefined;

    return discoveredNewMatch;
  }

  private async enrichScore(
    haloClient: HaloInfiniteClient,
    summary: IndividualTrackerMatchSummary,
    trackerState: IndividualTrackerInternalState,
  ): Promise<boolean> {
    let matchStats: MatchStats;
    try {
      matchStats = await haloClient.getMatchStats(summary.matchId);
    } catch (error) {
      if (this.isAuthError(error)) {
        this.ownerClient = null;
        throw error;
      }
      this.logService.warn(
        "IndividualTracker: getMatchStats failed",
        new Map([
          ["matchId", summary.matchId],
          ["error", String(error)],
        ]),
      );
      summary.score = "";
      return false;
    }

    summary.score = buildMatchScore(matchStats);
    const newRosterSignature = buildTeamRosterSignature(matchStats);
    if (summary.teamRosterSignature == null && newRosterSignature != null) {
      this.cachedResolvedRosterCount = (this.cachedResolvedRosterCount ?? 0) + 1;
    }
    summary.teamRosterSignature = newRosterSignature;
    summary.teamOutcomes = matchStats.Teams.map((team) => team.Outcome);

    const accumulatedIds = trackerState.accumulatedMatchIds ?? [];
    if (!accumulatedIds.includes(summary.matchId)) {
      if (accumulatePlayerStats(trackerState, matchStats)) {
        trackerState.accumulatedMatchIds = [...accumulatedIds, summary.matchId];
      }
    }

    return true;
  }

  private async resolveMapName(assetId: string, versionId: string): Promise<string> {
    try {
      return await this.services.haloService.getMapName(assetId, versionId);
    } catch (error) {
      this.logService.warn(
        "IndividualTracker: getMapName failed",
        new Map([
          ["assetId", assetId],
          ["error", String(error)],
        ]),
      );
      return "";
    }
  }

  private async markRegistryStopped(trackerState: IndividualTrackerInternalState): Promise<void> {
    try {
      const row = await this.services.databaseService.getIndividualTracker(trackerState.trackerId);
      if (row != null) {
        await this.services.individualTrackerService.markTrackerStatus(row, "stopped");
      }
    } catch (error) {
      this.logService.warn(
        "IndividualTracker: failed to mark registry stopped on idle timeout",
        new Map([
          ["trackerId", trackerState.trackerId],
          ["error", String(error)],
        ]),
      );
    }
  }

  private async getOwnerClient(userId: string): Promise<HaloInfiniteClient> {
    if (this.ownerClient != null) {
      return this.ownerClient;
    }

    const client = await this.services.userTokenProvider.getClientForUser(userId);
    if (client == null) {
      throw new Error("No Halo credentials available for tracker owner");
    }

    this.ownerClient = client;
    return client;
  }

  private isAuthError(error: unknown): boolean {
    if (error instanceof RequestError) {
      return error.response.status === 401;
    }
    const message = error instanceof Error ? error.message : String(error);
    return /\b401\b|unauthorized|expired|spartan token/i.test(message);
  }

  private handleError(trackerState: IndividualTrackerInternalState, error: unknown): void {
    trackerState.errorState.consecutiveErrors += 1;
    trackerState.errorState.lastErrorMessage = error instanceof Error ? error.message : String(error);
    trackerState.errorState.backoffMinutes = Math.min(
      NORMAL_INTERVAL_MINUTES + trackerState.errorState.consecutiveErrors * CONSECUTIVE_ERROR_INTERVAL_MINUTES,
      MAX_BACKOFF_INTERVAL_MINUTES,
    );
    trackerState.lastUpdateTime = new Date().toISOString();
  }

  private getNextAlarmInterval(trackerState: IndividualTrackerInternalState): number {
    if (trackerState.errorState.consecutiveErrors > 0) {
      return trackerState.errorState.backoffMinutes * 60 * 1000;
    }
    return ALARM_INTERVAL_MS;
  }

  private async handleStart(request: Request): Promise<Response> {
    const body = await request.json<IndividualTrackerStartRequest>();
    const now = new Date().toISOString();

    const trackerState: IndividualTrackerInternalState = {
      userId: body.userId,
      trackerId: body.trackerId,
      xuid: body.xuid,
      gamertag: body.gamertag,
      status: "active",
      isPaused: false,
      startTime: now,
      lastUpdateTime: now,
      searchStartTime: body.searchStartTime,
      lastMatchDiscoveredAt: undefined,
      checkCount: 0,
      matchIds: [],
      discoveredMatches: {},
      selectedMatchIds: [],
      idleTimeoutHours: body.idleTimeoutHours,
      errorState: {
        consecutiveErrors: 0,
        backoffMinutes: NORMAL_INTERVAL_MINUTES,
        lastSuccessTime: now,
        lastErrorMessage: undefined,
      },
    };

    await this.setState(trackerState);
    await this.state.storage.setAlarm(addMilliseconds(new Date(), ALARM_INTERVAL_MS).getTime());

    const response: IndividualTrackerStartResponse = { success: true, state: this.sanitizeState(trackerState) };
    return Response.json(response);
  }

  private async handlePause(): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    trackerState.isPaused = true;
    trackerState.status = "paused";
    trackerState.lastUpdateTime = new Date().toISOString();
    await this.state.storage.deleteAlarm();
    await this.setState(trackerState);
    this.broadcastViewState(trackerState);

    const response: IndividualTrackerPauseResponse = { success: true, state: this.sanitizeState(trackerState) };
    return Response.json(response);
  }

  private async handleResume(): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    trackerState.isPaused = false;
    trackerState.status = "active";
    trackerState.lastUpdateTime = new Date().toISOString();
    await this.setState(trackerState);
    await this.state.storage.setAlarm(addMilliseconds(new Date(), ALARM_INTERVAL_MS).getTime());
    this.broadcastViewState(trackerState);

    const response: IndividualTrackerResumeResponse = { success: true, state: this.sanitizeState(trackerState) };
    return Response.json(response);
  }

  private async handleStop(): Promise<Response> {
    const trackerState = await this.getState();

    await this.state.storage.deleteAlarm();
    await this.state.storage.delete(STATE_STORAGE_KEY);

    if (trackerState != null) {
      trackerState.status = "stopped";
      trackerState.lastUpdateTime = new Date().toISOString();
      this.broadcastViewState(trackerState);
      this.closeWebSockets("Tracker stopped");
    }

    const response: IndividualTrackerStopResponse = { success: true };
    return Response.json(response);
  }

  private async handleSelectMatches(request: Request): Promise<Response> {
    const trackerState = await this.getState();
    if (trackerState == null) {
      return new Response("Not Found", { status: 404 });
    }

    const body = await request.json<IndividualTrackerSelectMatchesRequest>();
    if (!Array.isArray(body.matchIds)) {
      return new Response("Bad Request", { status: 400 });
    }
    const known = new Set(trackerState.matchIds);
    trackerState.selectedMatchIds = body.matchIds.filter((id) => known.has(id)).sort();

    await this.setState(trackerState);
    this.broadcastViewState(trackerState);

    const response: IndividualTrackerSelectMatchesResponse = { success: true };
    return Response.json(response);
  }

  private async handleStatus(): Promise<Response> {
    const trackerState = await this.getState();
    const response: IndividualTrackerStatusResponse = {
      state: trackerState == null ? null : this.sanitizeState(trackerState),
    };
    return Response.json(response);
  }

  private async handleViewState(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const slotsParam = url.searchParams.get("topBarStatSlots");
    let topBarStatSlots: readonly IndividualTopBarStatOption[] = [];
    if (slotsParam != null) {
      try {
        topBarStatSlots = JSON.parse(slotsParam) as IndividualTopBarStatOption[];
      } catch {
        // malformed JSON — treat as empty slots
      }
    }

    const trackerState = await this.getState();
    const topBarStats =
      trackerState != null && topBarStatSlots.length > 0
        ? await this.buildTopBarStats(trackerState, topBarStatSlots)
        : undefined;

    const response: IndividualTrackerViewStateResponse = {
      state:
        trackerState == null
          ? null
          : {
              ...this.toViewState(trackerState),
              ...(topBarStats != null ? { topBarStats } : {}),
            },
    };
    return Response.json(response);
  }

  private async buildTopBarStats(
    state: IndividualTrackerInternalState,
    topBarStatSlots: readonly IndividualTopBarStatOption[],
  ): Promise<readonly TopBarStatItem[]> {
    const hasRankSlot =
      topBarStatSlots.includes("current-rank") ||
      topBarStatSlots.includes("season-peak") ||
      topBarStatSlots.includes("all-time-peak");
    const hasEsraSlot = topBarStatSlots.includes("esra");

    if (!hasRankSlot && !hasEsraSlot) {
      const latestMatchId = state.matchIds.at(-1) ?? "";
      const accumulatedCount = state.accumulatedMatchIds?.length ?? 0;
      this.cachedResolvedRosterCount ??= Object.values(state.discoveredMatches).filter(
        (s) => s.teamRosterSignature != null,
      ).length;
      const selectionKey = state.selectedMatchIds.join(",");
      const cacheKey = `${latestMatchId}:${accumulatedCount.toString()}:${this.cachedResolvedRosterCount.toString()}:${JSON.stringify(topBarStatSlots)}:${selectionKey}`;

      if (this.topBarStatsCacheKey === cacheKey && this.cachedTopBarStats != null) {
        return this.cachedTopBarStats;
      }

      const stats = computeTopBarStats(state, topBarStatSlots, undefined, undefined);
      this.topBarStatsCacheKey = cacheKey;
      this.cachedTopBarStats = stats;
      return stats;
    }

    const [csrContainer, esraData] = await Promise.all([
      hasRankSlot
        ? this.services.haloService
            .getRankedArenaCsrs([state.xuid])
            .then((m) => m.get(state.xuid) ?? null)
            .catch(() => {
              this.logService.warn("IndividualTracker: getRankedArenaCsrs failed", new Map([["xuid", state.xuid]]));
              return null;
            })
        : Promise.resolve(null),
      hasEsraSlot
        ? this.services.haloService.getPlayerEsra(state.xuid).catch(() => {
            this.logService.warn("IndividualTracker: getPlayerEsra failed", new Map([["xuid", state.xuid]]));
            return null;
          })
        : Promise.resolve(null),
    ]);

    return computeTopBarStats(state, topBarStatSlots, csrContainer, esraData);
  }

  private async getState(): Promise<IndividualTrackerInternalState | null> {
    const state = await this.state.storage.get<IndividualTrackerInternalState>(STATE_STORAGE_KEY);
    if (state != null) state.selectedMatchIds ??= [];
    return state ?? null;
  }

  private async setState(state: IndividualTrackerInternalState): Promise<void> {
    await this.state.storage.put(STATE_STORAGE_KEY, state);
  }

  private sanitizeState(state: IndividualTrackerInternalState): IndividualTrackerState {
    return {
      userId: state.userId,
      trackerId: state.trackerId,
      xuid: state.xuid,
      gamertag: state.gamertag,
      status: state.status,
      isPaused: state.isPaused,
      startTime: state.startTime,
      lastUpdateTime: state.lastUpdateTime,
      idleTimeoutHours: state.idleTimeoutHours,
    };
  }

  private toViewState(state: IndividualTrackerInternalState): IndividualTrackerViewState {
    const activeIds = getActiveMatchIds(state);
    const summaries = state.matchIds
      .filter((matchId) => activeIds.has(matchId))
      .map((matchId) => state.discoveredMatches[matchId])
      .filter((match): match is IndividualTrackerMatchSummary => match != null)
      .sort((left, right) => compareAsc(new Date(left.startTime), new Date(right.startTime)));

    const summariesById = new Map(summaries.map((summary) => [summary.matchId, summary]));

    const groupings = analyzeMatchGroupings(
      summaries.map((summary) => ({
        matchId: summary.matchId,
        isMatchmaking: summary.isMatchmaking,
        teamRosterSignature: summary.teamRosterSignature,
      })),
    );

    const series = groupings.map((matchIds): IndividualTrackerSeriesGroup => {
      const groupSummaries = matchIds
        .map((matchId) => summariesById.get(matchId))
        .filter((summary): summary is IndividualTrackerMatchSummary => summary != null);

      const teamWins = computeSeriesTeamWins(
        groupSummaries.map((summary) => ({
          startTime: summary.startTime,
          mapAssetId: summary.mapAssetId,
          mapVersionId: summary.mapVersionId,
          gameVariantCategory: summary.gameVariantCategory,
          teamOutcomes: summary.teamOutcomes ?? [],
        })),
      );

      return {
        id: `series:${buildSeriesGroupKey(matchIds)}`,
        matchIds,
        score: teamWins.length === 0 ? "0:0" : teamWins.join(":"),
        title: getDefaultSeriesGroupTitle(),
        subtitle: getDefaultSeriesGroupSubtitle(
          groupSummaries.map((summary) => ({
            startTime: summary.startTime,
            mapAssetId: summary.mapAssetId,
            mapVersionId: summary.mapVersionId,
            gameVariantCategory: summary.gameVariantCategory,
            outcome: summary.outcome,
          })),
        ),
      };
    });

    return {
      trackerId: state.trackerId,
      gamertag: state.gamertag,
      status: state.status,
      matches: summaries.map((summary) => ({
        matchId: summary.matchId,
        startTime: summary.startTime,
        endTime: summary.endTime,
        mapAssetId: summary.mapAssetId,
        mapVersionId: summary.mapVersionId,
        mapName: summary.mapName,
        modeAssetId: summary.modeAssetId,
        gameVariantCategory: summary.gameVariantCategory,
        outcome: summary.outcome,
        score: summary.score,
      })),
      series,
      lastUpdateTime: state.lastUpdateTime,
      lastMatchDiscoveredAt: state.lastMatchDiscoveredAt ?? null,
    };
  }

  private viewMessage(state: IndividualTrackerInternalState): string {
    return trackerViewMessageContract.serialize({ type: "view", view: this.toViewState(state) });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const trackerState = await this.getState();
    try {
      return this.webSocketAdapter.upgrade(
        this.state,
        trackerState != null ? this.viewMessage(trackerState) : undefined,
      );
    } catch (error) {
      this.logService.error("IndividualTracker: failed to establish WebSocket", new Map([["error", String(error)]]));
      Sentry.captureException(error);
      return new Response("Failed to establish WebSocket connection", { status: 500 });
    }
  }

  webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): void {
    this.logService.debug(
      "IndividualTracker: WebSocket message received (ignored)",
      new Map([["messageType", typeof message]]),
    );
  }

  webSocketClose(_ws: WebSocket, code: number, reason: string, wasClean: boolean): void {
    this.logService.debug(
      "IndividualTracker: WebSocket client disconnected",
      new Map([
        ["code", code.toString()],
        ["reason", reason],
        ["wasClean", wasClean.toString()],
      ]),
    );
  }

  webSocketError(_ws: WebSocket, error: unknown): void {
    this.logService.warn("IndividualTracker: WebSocket error", new Map([["error", String(error)]]));
  }

  private broadcastViewState(state: IndividualTrackerInternalState): void {
    this.webSocketAdapter.broadcast(this.state, this.viewMessage(state));
  }

  private closeWebSockets(reason: string): void {
    this.webSocketAdapter.closeAll(this.state, 1000, reason);
  }
}
