import * as Sentry from "@sentry/cloudflare";
import { AutoTokenProvider, HaloInfiniteClient, MatchType } from "halo-infinite-api";
import { addMilliseconds, differenceInHours, differenceInMilliseconds } from "date-fns";
import { installServices as installServicesImpl } from "../../services/install";
import type { LogService } from "../../services/log/types";
import type { DatabaseService } from "../../services/database/database";
import { UserTokenProvider } from "../../services/halo/user-token-provider";
import {
  type IndividualTrackerMatchSummary,
  type IndividualTrackerState,
  type IndividualTrackerStartRequest,
  type IndividualTrackerStartResponse,
  type IndividualTrackerStopResponse,
  type IndividualTrackerStatusResponse,
  type IndividualTrackerGamesAddResponse,
  type IndividualTrackerGamesRemoveResponse,
  type IndividualTrackerGamesMutateRequest,
} from "./types";

const DISPLAY_INTERVAL_MS = 3 * 60 * 1000;
const EXECUTION_BUFFER_MS = 8 * 1000;
const ALARM_INTERVAL_MS = DISPLAY_INTERVAL_MS - EXECUTION_BUFFER_MS;

const NORMAL_INTERVAL_MINUTES = 3;
const CONSECUTIVE_ERROR_INTERVAL_MINUTES = 5;
const MAX_BACKOFF_INTERVAL_MINUTES = 10;

const REFRESH_STALE_TIMEOUT_MS = 1 * 60 * 1000;

export class IndividualTrackerDO implements DurableObject, Rpc.DurableObjectBranded {
  __DURABLE_OBJECT_BRAND = undefined as never;
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private readonly logService: LogService;
  private readonly databaseService: DatabaseService;

  constructor(state: DurableObjectState, env: Env, installServices = installServicesImpl) {
    this.state = state;
    this.env = env;

    const services = installServices({ env });
    this.logService = services.logService;
    this.databaseService = services.databaseService;
  }

  async fetch(request: Request): Promise<Response> {
    return await Sentry.withScope(async () => {
      const url = new URL(request.url);
      const action = url.pathname.split("/").pop();

      Sentry.setTag("durableObject", "IndividualTrackerDO");
      Sentry.setTag("action", action ?? "unknown");

      try {
        switch (action) {
          case "start": {
            return await this.handleStart(request);
          }
          case "stop": {
            return await this.handleStop(request);
          }
          case "status": {
            return await this.handleStatus();
          }
          case "games-add": {
            return await this.handleGamesAdd(request);
          }
          case "games-remove": {
            return await this.handleGamesRemove(request);
          }
          case "websocket": {
            return await this.handleWebSocket();
          }
          case undefined: {
            return new Response("Bad Request", { status: 400 });
          }
          default: {
            return new Response("Not Found", { status: 404 });
          }
        }
      } catch (error) {
        this.logService.error("IndividualTrackerDO fetch error", new Map([["error", String(error)]]));
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

      if (trackerState == null || trackerState.status === "stopped") {
        await this.dispose("Tracker stopped, disposing on alarm");
        return;
      }

      if (trackerState.status !== "active" || trackerState.isPaused) {
        return;
      }

      if (this.checkAndHandleStaleLock(trackerState)) {
        this.logService.debug("IndividualTracker: refresh in progress, skipping alarm");
        await this.state.storage.setAlarm(
          addMilliseconds(new Date(), this.getNextAlarmInterval(trackerState)).getTime(),
        );
        return;
      }

      // Idle check: stop if no new match has been found within the configured window.
      const idleThresholdHours = trackerState.idleTimeoutHours;
      const lastActivity = new Date(trackerState.lastMatchDiscoveredAt);
      if (differenceInHours(new Date(), lastActivity) >= idleThresholdHours) {
        await this.dispose("Tracker idle, no new matches discovered within timeout window");
        return;
      }

      trackerState.refreshInProgress = true;
      trackerState.refreshStartedAt = new Date().toISOString();
      await this.setState(trackerState);

      Sentry.setContext("trackerState", {
        userId: trackerState.userId,
        trackerId: trackerState.trackerId,
        gamertag: trackerState.gamertag,
        checkCount: trackerState.checkCount,
        errorCount: trackerState.errorState.consecutiveErrors,
      });

      try {
        await this.executeTrackerUpdate(trackerState);
      } catch (error) {
        this.logService.error("IndividualTracker: alarm update failed", new Map([["error", String(error)]]));
        Sentry.captureException(error);
        this.handleError(trackerState, String(error));
      }

      await this.state.storage.setAlarm(addMilliseconds(new Date(), this.getNextAlarmInterval(trackerState)).getTime());

      await this.setState({
        ...trackerState,
        refreshInProgress: false,
        refreshStartedAt: undefined,
      }).catch((error: unknown) => {
        this.logService.error("Failed to clear refresh lock", new Map([["error", String(error)]]));
      });
    });
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  private async handleStart(request: Request): Promise<Response> {
    const body = await request.json<IndividualTrackerStartRequest>();

    const now = new Date().toISOString();
    const trackerState: IndividualTrackerState = {
      userId: body.userId,
      trackerId: body.trackerId,
      xuid: body.xuid,
      gamertag: body.gamertag,
      status: "active",
      isPaused: false,
      startTime: now,
      lastUpdateTime: now,
      searchStartTime: body.searchStartTime,
      lastMatchDiscoveredAt: now,
      checkCount: 0,
      idleTimeoutHours: body.idleTimeoutHours,
      userMicrosoftTokens: {
        accessToken: body.userMicrosoftAccessToken,
        refreshToken: body.userMicrosoftRefreshToken,
        expiresAt: undefined,
      },
      discoveredMatches: {},
      matchIds: [],
      excludedMatchIds: [],
      errorState: {
        consecutiveErrors: 0,
        backoffMinutes: NORMAL_INTERVAL_MINUTES,
        lastSuccessTime: now,
      },
      refreshInProgress: undefined,
      refreshStartedAt: undefined,
    };

    await this.setState(trackerState);
    await this.state.storage.setAlarm(addMilliseconds(new Date(), ALARM_INTERVAL_MS).getTime());

    const response: IndividualTrackerStartResponse = { success: true, state: trackerState };
    return Response.json(response, { status: 200 });
  }

  private async handleStop(request: Request): Promise<Response> {
    const body = await request.json<{ userId: string }>();
    const trackerState = await this.getState();

    if (trackerState == null) {
      return new Response("Not Found", { status: 404 });
    }

    if (trackerState.userId !== body.userId) {
      return new Response("Forbidden", { status: 403 });
    }

    await this.dispose("Explicitly stopped by owner");

    const response: IndividualTrackerStopResponse = { success: true, state: { ...trackerState, status: "stopped" } };
    return Response.json(response, { status: 200 });
  }

  private async handleStatus(): Promise<Response> {
    const trackerState = await this.getState();

    if (trackerState == null) {
      return new Response("Not Found", { status: 404 });
    }

    const response: IndividualTrackerStatusResponse = { state: trackerState };
    return Response.json(response, { status: 200 });
  }

  private async handleGamesAdd(request: Request): Promise<Response> {
    const body = await request.json<IndividualTrackerGamesMutateRequest>();
    const trackerState = await this.getState();

    if (trackerState == null) {
      return new Response("Not Found", { status: 404 });
    }

    if (trackerState.userId !== body.userId) {
      return new Response("Forbidden", { status: 403 });
    }

    if (trackerState.excludedMatchIds.includes(body.matchId)) {
      trackerState.excludedMatchIds = trackerState.excludedMatchIds.filter((id) => id !== body.matchId);
      await this.setState(trackerState);
    }

    const response: IndividualTrackerGamesAddResponse = { success: true, matchId: body.matchId };
    return Response.json(response, { status: 200 });
  }

  private async handleGamesRemove(request: Request): Promise<Response> {
    const body = await request.json<IndividualTrackerGamesMutateRequest>();
    const trackerState = await this.getState();

    if (trackerState == null) {
      return new Response("Not Found", { status: 404 });
    }

    if (trackerState.userId !== body.userId) {
      return new Response("Forbidden", { status: 403 });
    }

    if (!trackerState.excludedMatchIds.includes(body.matchId)) {
      trackerState.excludedMatchIds = [...trackerState.excludedMatchIds, body.matchId];
      await this.setState(trackerState);
    }

    const response: IndividualTrackerGamesRemoveResponse = { success: true, matchId: body.matchId };
    return Response.json(response, { status: 200 });
  }

  private async handleWebSocket(): Promise<Response> {
    const trackerState = await this.getState();

    if (trackerState == null) {
      return new Response("Tracker not found or not yet started", { status: 404 });
    }

    const webSocketPair = new WebSocketPair();
    const client = webSocketPair[0];
    const server = webSocketPair[1];

    try {
      this.state.acceptWebSocket(server);

      server.send(JSON.stringify({ type: "state", data: trackerState, timestamp: new Date().toISOString() }));

      return new Response(null, { status: 101, webSocket: client });
    } catch (error) {
      this.logService.error("IndividualTracker: failed WebSocket setup", new Map([["error", String(error)]]));
      try {
        server.close(1011, "Internal error");
      } catch {
        // ignore cleanup errors
      }
      return new Response("Failed to establish WebSocket connection", { status: 500 });
    }
  }

  // ─── WebSocket hibernation handlers ──────────────────────────────────────

  async webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Individual tracker websocket is read-only; client messages are ignored.
    this.logService.debug(
      "IndividualTracker: WebSocket message received (ignored)",
      new Map([["messageType", typeof message]]),
    );
    return Promise.resolve();
  }

  async webSocketClose(_ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    this.logService.debug(
      "IndividualTracker: WebSocket client disconnected",
      new Map([
        ["code", code.toString()],
        ["reason", reason],
        ["wasClean", wasClean.toString()],
        ["remainingClients", this.state.getWebSockets().length.toString()],
      ]),
    );
    return Promise.resolve();
  }

  async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    this.logService.warn("IndividualTracker: WebSocket error", new Map([["error", String(error)]]));
    return Promise.resolve();
  }

  // ─── Core update logic ────────────────────────────────────────────────────

  private async executeTrackerUpdate(trackerState: IndividualTrackerState): Promise<void> {
    const haloClient = await this.buildHaloClientForUser(trackerState);

    // Fetch the most recent 25 matches for this player.
    const matches = await haloClient.getPlayerMatches(trackerState.xuid, MatchType.All, 25);

    let discoveredNewMatch = false;
    for (const match of matches) {
      const matchId = match.MatchId;
      if (trackerState.matchIds.includes(matchId) || trackerState.excludedMatchIds.includes(matchId)) {
        continue;
      }

      // Only include matches that started at or after searchStartTime.
      const matchStart = new Date(match.MatchInfo.StartTime);
      const searchStart = new Date(trackerState.searchStartTime);
      if (matchStart < searchStart) {
        continue;
      }

      const summary: IndividualTrackerMatchSummary = {
        matchId,
        startTime: match.MatchInfo.StartTime,
        endTime: match.MatchInfo.EndTime,
        mapAssetId: match.MatchInfo.MapVariant.AssetId,
        modeAssetId: match.MatchInfo.UgcGameVariant.AssetId,
      };

      trackerState.discoveredMatches[matchId] = summary;
      trackerState.matchIds.push(matchId);
      discoveredNewMatch = true;
    }

    if (discoveredNewMatch) {
      trackerState.lastMatchDiscoveredAt = new Date().toISOString();
    }

    trackerState.checkCount += 1;
    trackerState.lastUpdateTime = new Date().toISOString();
    trackerState.errorState.consecutiveErrors = 0;
    trackerState.errorState.backoffMinutes = NORMAL_INTERVAL_MINUTES;
    trackerState.errorState.lastSuccessTime = new Date().toISOString();

    await this.setState(trackerState);
  }

  private async buildHaloClientForUser(trackerState: IndividualTrackerState): Promise<HaloInfiniteClient> {
    // If user's Microsoft tokens are available in state, create a user-scoped client
    if (
      trackerState.userMicrosoftTokens != null &&
      trackerState.userMicrosoftTokens.accessToken !== ""
    ) {
      const tokenProvider = new UserTokenProvider({
        userMicrosoftAccessToken: trackerState.userMicrosoftTokens.accessToken,
        userMicrosoftRefreshToken: trackerState.userMicrosoftTokens.refreshToken,
        clientId: this.env.MICROSOFT_CLIENT_ID,
        clientSecret: this.env.MICROSOFT_CLIENT_SECRET,
        redirectUri: this.env.MICROSOFT_REDIRECT_URI,
        logService: this.logService,
      });

      return new HaloInfiniteClient(tokenProvider);
    }

    // Fallback: use bot account (legacy behavior for existing trackers without user tokens)
    // Load the most recent session for this user to get their access token.
    const session = await this.databaseService.findUserSessionByUserId(trackerState.userId);
    if (session == null) {
      throw new Error(`No active session found for user ${trackerState.userId}`);
    }

    const accessToken = session.AccessToken;
    return new HaloInfiniteClient(new AutoTokenProvider(async () => Promise.resolve(accessToken)));
  }

  // ─── State helpers ────────────────────────────────────────────────────────

  private async getState(): Promise<IndividualTrackerState | null> {
    const state = await this.state.storage.get<IndividualTrackerState>("trackerState");
    return state ?? null;
  }

  private async setState(state: IndividualTrackerState): Promise<void> {
    await this.state.storage.put("trackerState", state);
    this.broadcastStateUpdate(state);
  }

  private broadcastStateUpdate(state: IndividualTrackerState): void {
    const allWebSockets = this.state.getWebSockets();
    if (allWebSockets.length === 0) {
      return;
    }

    const message = JSON.stringify({ type: "state", data: state, timestamp: new Date().toISOString() });

    for (const client of allWebSockets) {
      try {
        client.send(message);
      } catch (error) {
        this.logService.warn(
          "IndividualTracker: failed to send to WebSocket client",
          new Map([["error", String(error)]]),
        );
      }
    }
  }

  // ─── Error and alarm helpers ──────────────────────────────────────────────

  private handleError(state: IndividualTrackerState, message: string): void {
    state.errorState.consecutiveErrors += 1;
    state.errorState.lastErrorMessage = message;

    const backoff = Math.min(
      NORMAL_INTERVAL_MINUTES + state.errorState.consecutiveErrors * CONSECUTIVE_ERROR_INTERVAL_MINUTES,
      MAX_BACKOFF_INTERVAL_MINUTES,
    );
    state.errorState.backoffMinutes = backoff;
  }

  private getNextAlarmInterval(state: IndividualTrackerState): number {
    if (state.errorState.consecutiveErrors > 0) {
      return state.errorState.backoffMinutes * 60 * 1000;
    }
    return ALARM_INTERVAL_MS;
  }

  private checkAndHandleStaleLock(state: IndividualTrackerState): boolean {
    if (state.refreshInProgress !== true || state.refreshStartedAt == null) {
      return false;
    }

    const lockAge = differenceInMilliseconds(new Date(), new Date(state.refreshStartedAt));
    if (lockAge > REFRESH_STALE_TIMEOUT_MS) {
      state.refreshInProgress = false;
      state.refreshStartedAt = undefined;
      return false;
    }

    return true;
  }

  private async dispose(reason: string): Promise<void> {
    this.logService.info("IndividualTracker: disposing", new Map([["reason", reason]]));

    const allWebSockets = this.state.getWebSockets();
    const state = await this.getState();

    if (state != null) {
      const stoppedState = { ...state, status: "stopped" as const };
      const message = JSON.stringify({ type: "state", data: stoppedState, timestamp: new Date().toISOString() });
      for (const ws of allWebSockets) {
        try {
          ws.send(message);
        } catch {
          // ignore
        }
      }
    }

    for (const ws of allWebSockets) {
      try {
        ws.close(1000, "Tracker stopped");
      } catch {
        // ignore
      }
    }

    await this.state.storage.deleteAlarm();
    await this.state.storage.deleteAll();
  }
}
