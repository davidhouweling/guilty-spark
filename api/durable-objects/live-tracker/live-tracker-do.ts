import * as Sentry from "@sentry/cloudflare";
import type { APIChannel, APIGuildMember } from "discord-api-types/v10";
import { ChannelType, PermissionFlagsBits } from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import { addMilliseconds, addMinutes, differenceInMilliseconds, differenceInMinutes, max } from "date-fns";
import type {
  LiveTrackerMatchSummary,
  LiveTrackerStateData,
  PlayerAssociationData,
} from "@guilty-spark/shared/live-tracker/types";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getReadableDuration } from "@guilty-spark/shared/halo/duration";
import { getMedalMetadataFromMatches } from "@guilty-spark/shared/halo/medals";
import {
  liveTrackerStartContract,
  liveTrackerStartRequestSchema,
  liveTrackerPauseContract,
  liveTrackerResumeContract,
  liveTrackerStopContract,
} from "@guilty-spark/shared/contracts/durable-objects/live-tracker/lifecycle";
import type {
  LiveTrackerEmbedData,
  LiveTrackerStartRequest,
} from "@guilty-spark/shared/contracts/durable-objects/live-tracker/lifecycle";
import {
  liveTrackerRefreshContract,
  liveTrackerRefreshRequestSchema,
  liveTrackerSubstitutionContract,
  liveTrackerSubstitutionRequestSchema,
  liveTrackerStatusContract,
  liveTrackerRepostContract,
  liveTrackerRepostRequestSchema,
  type LiveTrackerRefreshRequest,
} from "@guilty-spark/shared/contracts/durable-objects/live-tracker/management";
import { liveTrackerSeriesDataContract } from "@guilty-spark/shared/contracts/durable-objects/live-tracker/series-data";
import { parseJsonBody } from "@guilty-spark/shared/base/request-parsing";
import type { LogService } from "../../services/log/types";
import type { DiscordService } from "../../services/discord/discord";
import type { HaloService } from "../../services/halo/halo";
import type { DatabaseService } from "../../services/database/database";
import { installServices as installServicesImpl } from "../../services/install";
import {
  CloudflareWebSocketHibernationAdapter,
  type WebSocketHibernationAdapter,
} from "../../base/websocket-hibernation-adapter";
import { LiveTrackerEmbed } from "../../embeds/live-tracker-embed";
import { LiveTrackerLoadingEmbed } from "../../embeds/live-tracker-loading-embed";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error";
import { DiscordError } from "../../services/discord/discord-error";
import type { SeriesData } from "../../services/halo/types";
import type { LiveTrackerState } from "./types";

// Production: 3 minutes for live tracking (user-facing display)
const DISPLAY_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes shown to users
const EXECUTION_BUFFER_MS = 8 * 1000; // 8 seconds earlier execution for processing time
const ALARM_INTERVAL_MS = DISPLAY_INTERVAL_MS - EXECUTION_BUFFER_MS; // Execute 8 seconds early

// Inactivity threshold for considering a tracker stale (e.g. if Halo API isn't returning new data, players have stopped playing the queue, or if the tracker is between matches and not being refreshed)
const STALE_TRACKER_THRESHOLD_MINUTES = 180;

// Error handling constants for exponential backoff
const NORMAL_INTERVAL_MINUTES = 3;
const FIRST_ERROR_INTERVAL_MINUTES = 3;
const CONSECUTIVE_ERROR_INTERVAL_MINUTES = 5;
const MAX_BACKOFF_INTERVAL_MINUTES = 10;
const ERROR_THRESHOLD_MINUTES = 10;

const REFRESH_COOLDOWN_MS = 30 * 1000;
const REFRESH_STALE_TIMEOUT_MS = 1 * 60 * 1000;

export class LiveTrackerDO implements DurableObject, Rpc.DurableObjectBranded {
  __DURABLE_OBJECT_BRAND = undefined as never;
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private readonly logService: LogService;
  private readonly discordService: DiscordService;
  private readonly haloService: HaloService;
  private readonly databaseService: DatabaseService;
  private readonly webSocketAdapter: WebSocketHibernationAdapter;
  private disposed = false;

  constructor(
    state: DurableObjectState,
    env: Env,
    installServices = installServicesImpl,
    webSocketAdapter: WebSocketHibernationAdapter = new CloudflareWebSocketHibernationAdapter(),
  ) {
    this.state = state;
    this.env = env;

    const services = installServices({ env });
    this.logService = services.logService;
    this.discordService = services.discordService;
    this.haloService = services.haloService;
    this.databaseService = services.databaseService;
    this.webSocketAdapter = webSocketAdapter;
  }

  async fetch(request: Request): Promise<Response> {
    return await Sentry.withScope(async () => {
      const url = new URL(request.url);
      const action = url.pathname.split("/").pop();

      // Add context to Sentry
      Sentry.setTag("durableObject", "LiveTrackerDO");
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
          case "refresh": {
            return await this.handleRefresh(request);
          }
          case "substitution": {
            return await this.handleSubstitution(request);
          }
          case "status": {
            return await this.handleStatus();
          }
          case "repost": {
            return await this.handleRepost(request);
          }
          case "websocket": {
            return await this.handleWebSocket(request);
          }
          case "series-data": {
            return await this.handleGetSeriesData();
          }
          case undefined: {
            return new Response("Bad Request", { status: 400 });
          }
          default: {
            return new Response("Not Found", { status: 404 });
          }
        }
      } catch (error) {
        this.logService.error("LiveTrackerDO fetch error:", new Map([["error", String(error)]]));
        Sentry.captureException(error);
        return new Response("Internal Server Error", { status: 500 });
      }
    });
  }

  async alarm(): Promise<void> {
    await Sentry.withScope(async () => {
      Sentry.setTag("durableObject", "LiveTrackerDO");
      Sentry.setTag("method", "alarm");

      const trackerState = await this.getState();
      if (trackerState?.status === "stopped") {
        await this.dispose(trackerState, "Tracker stopped, disposing on alarm");
        return;
      }

      if (trackerState?.status !== "active" || trackerState.isPaused) {
        return;
      }

      try {
        if (this.checkAndHandleStaleLock(trackerState)) {
          this.logService.debug("Refresh in progress, skipping alarm execution");
          const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
          await this.state.storage.setAlarm(addMilliseconds(new Date(), nextAlarmInterval).getTime());
          return;
        }

        // Load matches from KV to check for stale tracker
        const rawMatches = await this.loadMatchesFromKV(trackerState.matchIds);
        const rawMatchesArray = Object.values(rawMatches);
        const lastGameActivityTime =
          rawMatchesArray.length > 0
            ? max(rawMatchesArray.map((m) => m.MatchInfo.EndTime))
            : new Date(trackerState.searchStartTime);
        if (differenceInMinutes(new Date(), lastGameActivityTime) > STALE_TRACKER_THRESHOLD_MINUTES) {
          await this.dispose(trackerState, "Tracker stale, disposing on alarm");
          return;
        }

        trackerState.refreshInProgress = true;
        trackerState.refreshStartedAt = new Date().toISOString();
        await this.setState(trackerState);

        Sentry.setContext("trackerState", {
          queueNumber: trackerState.queueNumber,
          guildId: trackerState.guildId,
          channelId: trackerState.channelId,
          checkCount: trackerState.checkCount,
          errorCount: trackerState.errorState.consecutiveErrors,
        });

        this.logService.info(
          `LiveTracker: alarm fired for queue ${trackerState.queueNumber.toString()}`,
          new Map([
            ["guildId", trackerState.guildId],
            ["channelId", trackerState.channelId],
            ["queueNumber", trackerState.queueNumber.toString()],
            ["checkCount", trackerState.checkCount.toString()],
            ["errorCount", trackerState.errorState.consecutiveErrors.toString()],
            ["backoffMinutes", trackerState.errorState.backoffMinutes.toString()],
          ]),
        );

        const fetchStartTime = Date.now();
        try {
          await this.executeTrackerUpdate(trackerState);
          const fetchDurationMs = Date.now() - fetchStartTime;

          this.logService.info(
            `LiveTracker: alarm completed for queue ${trackerState.queueNumber.toString()} (took ${fetchDurationMs.toString()}ms)`,
            new Map([
              ["fetchDurationMs", fetchDurationMs.toString()],
              ["searchStartTime", new Date(trackerState.searchStartTime).toISOString()],
              ["currentTime", new Date().toISOString()],
            ]),
          );
        } catch (error) {
          // 10003 = Unknown channel
          if (error instanceof DiscordError && (error.httpStatus === 404 || error.restError.code === 10003)) {
            this.logService.warn(
              "LiveTracker channel not found, likely finished",
              new Map([
                ["channelId", trackerState.channelId],
                ["messageId", trackerState.liveMessageId],
              ]),
            );
            await this.dispose(trackerState, "Discord channel not found (deleted or inaccessible)");
            return;
          }

          // If executeTrackerUpdate threw due to disposal, don't reschedule
          if (error instanceof Error && error.message.includes("Tracker stopped due to persistent errors")) {
            return;
          }

          this.logService.error(
            "Failed to update LiveTracker message",
            new Map([
              ["error", String(error)],
              ["messageId", trackerState.liveMessageId],
            ]),
          );
          this.handleError(trackerState, `Discord update failed: ${String(error)}`);
        }

        const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
        await this.state.storage.setAlarm(addMilliseconds(new Date(), nextAlarmInterval).getTime());
      } catch (error) {
        this.logService.error("LiveTracker alarm error:", new Map([["error", String(error)]]));
        Sentry.captureException(error);
      } finally {
        // Always clear the lock and persist state
        await this.setState({
          ...trackerState,
          refreshInProgress: false,
          refreshStartedAt: undefined,
        }).catch((error: unknown) => {
          this.logService.error(
            "Failed to clear refresh lock in alarm finally block",
            new Map([["error", String(error)]]),
          );
        });
      }
    });
  }

  private async handleStart(request: Request): Promise<Response> {
    const parsed = await parseJsonBody(request, liveTrackerStartRequestSchema, "Invalid start request");
    if (!parsed.success) {
      return parsed.response;
    }
    const startRequest = parsed.data;

    const trackerState: LiveTrackerState = {
      userId: startRequest.userId,
      guildId: startRequest.guildId,
      channelId: startRequest.channelId,
      queueNumber: startRequest.queueNumber,
      isPaused: false,
      status: "active",
      liveMessageId: startRequest.liveMessageId,
      startTime: new Date().toISOString(),
      lastUpdateTime: new Date().toISOString(),
      searchStartTime: startRequest.queueStartTime,
      checkCount: 0,
      players: startRequest.players as Record<string, APIGuildMember>,
      teams: startRequest.teams,
      substitutions: [],
      discoveredMatches: {},
      matchIds: [],
      seriesScore: "0:0",
      errorState: {
        consecutiveErrors: 0,
        backoffMinutes: NORMAL_INTERVAL_MINUTES,
        lastSuccessTime: new Date().toISOString(),
        lastErrorMessage: undefined,
      },
      lastMessageState: {
        matchCount: 0,
        substitutionCount: 0,
      },
      playersAssociationData: startRequest.playersAssociationData as Record<string, PlayerAssociationData>,
    };

    await this.setState(trackerState);

    try {
      const loadingMessage = await this.createInitialMessage(startRequest);
      trackerState.liveMessageId = loadingMessage.id;
      await this.setState(trackerState);

      const currentTime = new Date();
      const nextCheckTime = addMinutes(currentTime, 3);

      const embedData = await this.buildEnrichedEmbedData(trackerState, {
        status: "active",
        isPaused: false,
        nextCheck: nextCheckTime,
      });

      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService: this.discordService, pagesUrl: this.env.PAGES_URL },
        embedData,
      );

      const initialChannelSeriesScore = this.haloService.getSeriesScore([], "en-US", trackerState.teams.length === 2);
      await this.updateChannelName(trackerState, initialChannelSeriesScore, true);
      await this.discordService.editMessage(
        startRequest.channelId,
        loadingMessage.id,
        liveTrackerEmbed.toMessageData(),
      );

      this.logService.info(
        `LiveTracker: Created live tracker message for queue ${trackerState.queueNumber.toString()}`,
        new Map([["messageId", loadingMessage.id]]),
      );
    } catch (error) {
      // 10003 = Unknown channel
      if (error instanceof DiscordError && (error.httpStatus === 404 || error.restError.code === 10003)) {
        this.logService.warn(
          "LiveTracker: channel not found during start",
          new Map([
            ["channelId", trackerState.channelId],
            ["messageId", trackerState.liveMessageId],
          ]),
        );
        await this.dispose(trackerState, "Discord channel not found during initialization");
        return this.createStartFailureResponse(trackerState);
      }

      this.logService.error(
        "LiveTracker: Failed to create initial live tracker message",
        new Map([["error", String(error)]]),
      );
    }

    await this.state.storage.setAlarm(addMilliseconds(new Date(), ALARM_INTERVAL_MS).getTime());
    return this.createStartSuccessResponse(trackerState);
  }

  private async createInitialMessage(startData: LiveTrackerStartRequest): Promise<{ id: string }> {
    const liveTrackerLoadingEmbed = new LiveTrackerLoadingEmbed();
    const loadingEmbedData = {
      embeds: [liveTrackerLoadingEmbed.embed],
    };

    if (startData.interactionToken != null && startData.interactionToken !== "") {
      return await this.discordService.updateDeferredReply(startData.interactionToken, loadingEmbedData);
    } else {
      return await this.discordService.createMessage(startData.channelId, loadingEmbedData);
    }
  }

  private async handlePause(): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    trackerState.isPaused = true;
    trackerState.status = "paused";
    const currentTime = new Date();
    trackerState.lastUpdateTime = currentTime.toISOString();
    await this.setState(trackerState);

    if (Object.keys(trackerState.discoveredMatches).length > 0) {
      try {
        const embedData = await this.buildEnrichedEmbedData(trackerState);

        return this.createPauseResponse(trackerState, embedData);
      } catch (error) {
        this.logService.warn(
          "LiveTracker: Failed to enrich pause response, returning basic state",
          new Map([["error", String(error)]]),
        );
      }
    }

    return this.createPauseResponse(trackerState);
  }

  private async handleResume(): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    trackerState.isPaused = false;
    trackerState.status = "active";
    const currentTime = new Date();
    trackerState.lastUpdateTime = currentTime.toISOString();
    await this.setState(trackerState);

    await this.state.storage.setAlarm(addMilliseconds(new Date(), ALARM_INTERVAL_MS).getTime());

    if (Object.keys(trackerState.discoveredMatches).length > 0) {
      try {
        const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
        const nextCheckTime = new Date(currentTime.getTime() + nextAlarmInterval + EXECUTION_BUFFER_MS);

        const embedData = await this.buildEnrichedEmbedData(trackerState, {
          nextCheck: nextCheckTime,
        });

        return this.createResumeResponse(trackerState, embedData);
      } catch (error) {
        this.logService.warn(
          "LiveTracker: Failed to enrich resume response, returning basic state",
          new Map([["error", String(error)]]),
        );
      }
    }

    return this.createResumeResponse(trackerState);
  }

  private async handleStop(): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    let embedData: LiveTrackerEmbedData | undefined;
    if (Object.keys(trackerState.discoveredMatches).length > 0) {
      try {
        embedData = await this.buildEnrichedEmbedData(trackerState, {
          status: "stopped",
          isPaused: false,
        });
      } catch (error) {
        this.logService.warn(
          "LiveTracker: Failed to enrich stop response, returning basic state",
          new Map([["error", String(error)]]),
        );
      }
    }

    trackerState.status = "stopped";

    await this.dispose(trackerState, "Explicitly stopped via handleStop");

    return this.createStopResponse(trackerState, embedData);
  }

  private async handleRefresh(request: Request): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    if (this.checkAndHandleStaleLock(trackerState)) {
      this.logService.debug("Refresh already in progress, ignoring concurrent request");
      return new Response(
        JSON.stringify({
          success: false,
          error: "in_progress",
          message: "A refresh is already in progress, please wait",
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    trackerState.refreshInProgress = true;
    trackerState.refreshStartedAt = new Date().toISOString();
    await this.setState(trackerState);

    try {
      let body: LiveTrackerRefreshRequest = {};

      try {
        const text = await request.text();
        if (text && text.trim() !== "") {
          body = liveTrackerRefreshRequestSchema.parse(JSON.parse(text));
        }
      } catch (error) {
        this.logService.warn(
          "LiveTracker: Failed to parse refresh request body, using defaults",
          new Map([["error", String(error)]]),
        );
      }

      if (trackerState.status === "stopped") {
        return new Response("Cannot refresh stopped tracker", { status: 400 });
      }

      if (
        body.matchCompleted !== true &&
        trackerState.lastRefreshAttempt != null &&
        trackerState.lastRefreshAttempt !== ""
      ) {
        const lastAttemptTime = new Date(trackerState.lastRefreshAttempt);
        const currentTime = new Date();
        const timeSinceLastAttempt = differenceInMilliseconds(currentTime, lastAttemptTime);

        if (timeSinceLastAttempt < REFRESH_COOLDOWN_MS) {
          const remainingMs = REFRESH_COOLDOWN_MS - timeSinceLastAttempt;
          const cooldownEndsAt = addMilliseconds(currentTime, remainingMs);
          const cooldownTimestamp = this.discordService.getTimestamp(cooldownEndsAt.toISOString(), "R");

          return this.createRefreshCooldownResponse(
            `Refresh cooldown active, next refresh available ${cooldownTimestamp}`,
          );
        }
      }

      try {
        trackerState.lastRefreshAttempt = new Date().toISOString();

        const skipMessageUpdate = body.matchCompleted === true;
        await this.executeTrackerUpdate(trackerState, { skipMessageUpdate });

        return this.createRefreshSuccessResponse(trackerState);
      } catch (error) {
        // 10003 = Unknown channel
        if (error instanceof DiscordError && (error.httpStatus === 404 || error.restError.code === 10003)) {
          this.logService.warn(
            "LiveTracker: channel not found during refresh",
            new Map([
              ["channelId", trackerState.channelId],
              ["messageId", trackerState.liveMessageId],
            ]),
          );
          await this.dispose(trackerState, "Discord channel not found during refresh");
          return this.createRefreshFailureResponse(trackerState);
        }

        this.logService.error("LiveTracker: Failed to refresh live tracker", new Map([["error", String(error)]]));
        this.handleError(trackerState, `Refresh failed: ${String(error)}`);
        return new Response("Internal Server Error", { status: 500 });
      }
    } finally {
      await this.setState({
        ...trackerState,
        refreshInProgress: false,
        refreshStartedAt: undefined,
      }).catch((error: unknown) => {
        this.logService.error("Failed to clear refresh lock in finally block", new Map([["error", String(error)]]));
      });
    }
  }

  private async handleSubstitution(request: Request): Promise<Response> {
    const parsed = await parseJsonBody(request, liveTrackerSubstitutionRequestSchema, "Invalid substitution request");
    if (!parsed.success) {
      return parsed.response;
    }
    const { playerOutId, playerInId, playerAssociationData } = parsed.data;
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    if (trackerState.status === "stopped") {
      return new Response("Cannot process substitution for stopped tracker", { status: 400 });
    }

    try {
      // sync any matches that just completed prior to the substitution
      await this.fetchAndMergeSeriesData(trackerState);

      let teamIndex = -1;
      let playerIndex = -1;

      for (const [tIndex, team] of trackerState.teams.entries()) {
        const pIndex = team.playerIds.findIndex((id) => id === playerOutId);
        if (pIndex !== -1) {
          teamIndex = tIndex;
          playerIndex = pIndex;
          break;
        }
      }

      if (teamIndex === -1 || playerIndex === -1) {
        this.logService.warn(
          `LiveTracker: Substitution player not found in teams`,
          new Map([
            ["playerOutId", playerOutId],
            ["playerInId", playerInId],
            ["queueNumber", trackerState.queueNumber.toString()],
          ]),
        );
        return new Response("Player not found in teams", { status: 400 });
      }

      const newPlayerMember = await this.discordService.getGuildMember(trackerState.guildId, playerInId);
      const targetTeam = trackerState.teams[teamIndex];
      if (!targetTeam) {
        return new Response("Team not found", { status: 400 });
      }
      targetTeam.playerIds[playerIndex] = playerInId;
      trackerState.players[playerInId] = newPlayerMember;
      trackerState.playersAssociationData = {
        ...trackerState.playersAssociationData,
        [playerInId]: playerAssociationData as unknown as PlayerAssociationData,
      };
      const now = new Date().toISOString();
      trackerState.searchStartTime = now;

      trackerState.substitutions.push({
        playerOutId,
        playerInId,
        teamIndex,
        teamName: targetTeam.name,
        timestamp: now,
      });

      await this.setState(trackerState);

      this.logService.info(
        `LiveTracker: Processed substitution for queue ${trackerState.queueNumber.toString()}`,
        new Map([
          ["playerOutId", playerOutId],
          ["playerInId", playerInId],
          ["teamIndex", teamIndex.toString()],
          ["teamName", targetTeam.name],
        ]),
      );

      return this.createSubstitutionResponse(playerOutId, playerInId, teamIndex);
    } catch (error) {
      this.logService.error("Failed to process substitution", new Map([["error", String(error)]]));
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  private async handleStatus(): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    return this.createStatusResponse(trackerState);
  }

  private async handleRepost(request: Request): Promise<Response> {
    const parsed = await parseJsonBody(request, liveTrackerRepostRequestSchema, "Invalid repost request");
    if (!parsed.success) {
      return parsed.response;
    }
    const { newMessageId } = parsed.data;

    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    if (trackerState.status === "stopped") {
      return new Response("Cannot repost for stopped tracker", { status: 400 });
    }

    if (!newMessageId || newMessageId.trim() === "") {
      return new Response("New message ID is required", { status: 400 });
    }

    const oldMessageId = trackerState.liveMessageId;
    trackerState.liveMessageId = newMessageId;
    trackerState.lastUpdateTime = new Date().toISOString();

    await this.setState(trackerState);

    this.logService.info(
      `LiveTracker: Updated live message ID for queue ${trackerState.queueNumber.toString()}`,
      new Map([
        ["oldMessageId", oldMessageId ?? "none"],
        ["newMessageId", newMessageId],
        ["queueNumber", trackerState.queueNumber.toString()],
      ]),
    );

    return this.createRepostResponse(oldMessageId ?? "none", newMessageId);
  }

  private async handleGetSeriesData(): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    if (trackerState.status === "stopped") {
      return new Response("Series is stopped", { status: 410 });
    }

    const seriesData = {
      seriesId: {
        guildId: trackerState.guildId,
        queueNumber: trackerState.queueNumber,
      },
      teams: trackerState.teams.map((team) => ({
        name: team.name,
        playerIds: team.playerIds,
      })),
      seriesScore: trackerState.seriesScore,
      matchIds: trackerState.matchIds,
      discoveredMatches: trackerState.discoveredMatches,
      rawMatches: Object.values(await this.loadMatchesFromKV(trackerState.matchIds)),
      playersAssociationData: trackerState.playersAssociationData,
      substitutions: trackerState.substitutions,
      startTime: trackerState.startTime,
      lastUpdateTime: trackerState.lastUpdateTime,
    };

    this.logService.debug(
      `LiveTracker: Serving series data for queue ${trackerState.queueNumber.toString()}`,
      new Map([
        ["guildId", trackerState.guildId],
        ["queueNumber", trackerState.queueNumber.toString()],
        ["matchCount", seriesData.matchIds.length.toString()],
      ]),
    );

    return liveTrackerSeriesDataContract.toResponse(seriesData);
  }

  private async getState(): Promise<LiveTrackerState | null> {
    const state = await this.state.storage.get<LiveTrackerState>("trackerState");
    return state ?? null;
  }

  private async setState(state: LiveTrackerState): Promise<void> {
    if (this.disposed) {
      return;
    }
    await this.state.storage.put("trackerState", state);
    // Broadcast state update to all connected WebSocket clients
    await this.broadcastStateUpdate(state);
  }

  // KV storage helpers for match data
  private async saveMatchToKV(matchId: string, matchStats: MatchStats): Promise<void> {
    const key = `live-tracker-match:${matchId}`;
    await this.env.APP_DATA.put(key, JSON.stringify(matchStats), {
      expirationTtl: 86400, // 24 hours
    });
  }

  private async loadMatchesFromKV(matchIds: readonly string[]): Promise<Record<string, MatchStats>> {
    const matches: Record<string, MatchStats> = {};
    await Promise.all(
      matchIds.map(async (matchId) => {
        const key = `live-tracker-match:${matchId}`;
        const data = await this.env.APP_DATA.get<MatchStats>(key, "json");
        if (data !== null) {
          matches[matchId] = data;
        }
      }),
    );
    return matches;
  }

  /**
   * Loads matches from KV and computes the series score, updating trackerState
   * @returns The computed series score
   */
  private async computeAndUpdateSeriesScore(
    trackerState: LiveTrackerState,
  ): Promise<{ seriesScore: string; seriesScoreWithEmoji: string }> {
    const rawMatches = await this.loadMatchesFromKV(trackerState.matchIds);
    const rawMatchesArray = Object.values(rawMatches);
    const seriesScore = this.haloService.getSeriesScore(rawMatchesArray, "en-US");
    trackerState.seriesScore = seriesScore;

    return { seriesScore, seriesScoreWithEmoji: this.haloService.getSeriesScore(rawMatchesArray, "en-US", true) };
  }

  /**
   * Fetches series data and builds enriched embed data
   * @param trackerState - Current tracker state
   * @param options - Configuration options for embed data
   * @returns Enriched embed data ready for Discord message
   */
  private async buildEnrichedEmbedData(
    trackerState: LiveTrackerState,
    options: {
      status?: LiveTrackerState["status"];
      isPaused?: boolean;
      nextCheck?: Date;
    } = {},
  ): Promise<LiveTrackerEmbedData> {
    const currentTime = new Date();
    const enrichedMatches = await this.fetchAndMergeSeriesData(trackerState);
    const { seriesScore } = await this.computeAndUpdateSeriesScore(trackerState);

    return {
      userId: trackerState.userId,
      guildId: trackerState.guildId,
      channelId: trackerState.channelId,
      queueNumber: trackerState.queueNumber,
      status: options.status ?? trackerState.status,
      isPaused: options.isPaused ?? trackerState.isPaused,
      lastUpdated: currentTime,
      nextCheck: options.nextCheck,
      enrichedMatches,
      seriesScore,
      substitutions: trackerState.substitutions,
      errorState: trackerState.errorState,
    };
  }

  // Typed response helpers
  private createStartSuccessResponse(state: LiveTrackerState): Response {
    return liveTrackerStartContract.toResponse({ success: true, state });
  }

  private createStartFailureResponse(state: LiveTrackerState): Response {
    return liveTrackerStartContract.toResponse({ success: false, state });
  }

  private createPauseResponse(state: LiveTrackerState, embedData?: LiveTrackerEmbedData): Response {
    return liveTrackerPauseContract.toResponse(
      embedData ? { success: true, state, embedData } : { success: true, state },
    );
  }

  private createResumeResponse(state: LiveTrackerState, embedData?: LiveTrackerEmbedData): Response {
    return liveTrackerResumeContract.toResponse(
      embedData ? { success: true, state, embedData } : { success: true, state },
    );
  }

  private createStopResponse(state: LiveTrackerState, embedData?: LiveTrackerEmbedData): Response {
    return liveTrackerStopContract.toResponse(
      embedData ? { success: true, state, embedData } : { success: true, state },
    );
  }

  private createRefreshSuccessResponse(state: LiveTrackerState): Response {
    return liveTrackerRefreshContract.toResponse({ success: true, state });
  }

  private createRefreshCooldownResponse(message: string): Response {
    return liveTrackerRefreshContract.toResponse({ success: false, error: "cooldown", message }, { status: 429 });
  }

  private createRefreshFailureResponse(state: LiveTrackerState): Response {
    return liveTrackerRefreshContract.toResponse({ success: false, state });
  }

  private createSubstitutionResponse(playerOutId: string, playerInId: string, teamIndex: number): Response {
    return liveTrackerSubstitutionContract.toResponse({
      success: true,
      substitution: { playerOutId, playerInId, teamIndex },
    });
  }

  private createStatusResponse(state: LiveTrackerState): Response {
    return liveTrackerStatusContract.toResponse({ state });
  }

  private createRepostResponse(oldMessageId: string, newMessageId: string): Response {
    return liveTrackerRepostContract.toResponse({ success: true, oldMessageId, newMessageId });
  }

  /**
   * Handle error with exponential backoff strategy
   * Success: 3 minutes (normal interval)
   * First error: 3 minutes (show warning in embed)
   * Consecutive errors: 5 minutes → 10 minutes
   * After 10 minutes of failures: Stop with error message
   */
  private handleError(trackerState: LiveTrackerState, errorMessage: string): void {
    trackerState.errorState.consecutiveErrors += 1;
    trackerState.errorState.lastErrorMessage = errorMessage;

    if (trackerState.errorState.consecutiveErrors === 1) {
      trackerState.errorState.backoffMinutes = FIRST_ERROR_INTERVAL_MINUTES;
    } else {
      trackerState.errorState.backoffMinutes = Math.min(
        CONSECUTIVE_ERROR_INTERVAL_MINUTES * trackerState.errorState.consecutiveErrors,
        MAX_BACKOFF_INTERVAL_MINUTES,
      );
    }

    this.logService.warn(
      `Error in live tracker, backoff: ${trackerState.errorState.backoffMinutes.toString()} minutes`,
      new Map([
        ["consecutiveErrors", trackerState.errorState.consecutiveErrors.toString()],
        ["errorMessage", errorMessage],
        ["queueNumber", trackerState.queueNumber.toString()],
      ]),
    );
  }

  /**
   * Handle success - reset error state
   */
  private handleSuccess(trackerState: LiveTrackerState): void {
    trackerState.errorState.consecutiveErrors = 0;
    trackerState.errorState.backoffMinutes = NORMAL_INTERVAL_MINUTES;
    trackerState.errorState.lastSuccessTime = new Date().toISOString();
    trackerState.errorState.lastErrorMessage = undefined;
  }

  /**
   * Check if tracker should stop due to persistent errors
   */
  private shouldStopDueToErrors(trackerState: LiveTrackerState): boolean {
    if (trackerState.errorState.consecutiveErrors === 0) {
      return false;
    }

    const errorDurationMinutes = trackerState.errorState.backoffMinutes * trackerState.errorState.consecutiveErrors;
    return errorDurationMinutes >= ERROR_THRESHOLD_MINUTES;
  }

  private getNextAlarmInterval(trackerState: LiveTrackerState): number {
    if (trackerState.errorState.consecutiveErrors === 0) {
      return ALARM_INTERVAL_MS;
    }

    return trackerState.errorState.backoffMinutes * 60 * 1000 - EXECUTION_BUFFER_MS;
  }

  private async executeTrackerUpdate(
    trackerState: LiveTrackerState,
    options: { skipMessageUpdate?: boolean } = {},
  ): Promise<void> {
    const { skipMessageUpdate = false } = options;

    let enrichedMatches: LiveTrackerMatchSummary[] = [];

    try {
      enrichedMatches = await this.fetchAndMergeSeriesData(trackerState);
      this.handleSuccess(trackerState);
    } catch (error) {
      this.logService.warn("Failed to fetch series data, using empty data", new Map([["error", String(error)]]));
      this.handleError(trackerState, String(error));

      if (this.shouldStopDueToErrors(trackerState)) {
        this.logService.error(
          `Stopping live tracker due to persistent errors (${trackerState.errorState.consecutiveErrors.toString()} consecutive errors)`,
          new Map([
            ["queueNumber", trackerState.queueNumber.toString()],
            ["lastError", trackerState.errorState.lastErrorMessage ?? "unknown"],
          ]),
        );
        await this.dispose(
          trackerState,
          `Persistent errors: ${trackerState.errorState.consecutiveErrors.toString()} consecutive failures`,
        );
        throw new Error("Tracker stopped due to persistent errors");
      }
    }

    trackerState.checkCount += 1;
    const currentTime = new Date();
    trackerState.lastUpdateTime = currentTime.toISOString();

    if (skipMessageUpdate) {
      return;
    }

    const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
    const nextCheckTime = new Date(currentTime.getTime() + nextAlarmInterval + EXECUTION_BUFFER_MS);

    const { seriesScore, seriesScoreWithEmoji } = await this.computeAndUpdateSeriesScore(trackerState);

    const liveTrackerEmbed = new LiveTrackerEmbed(
      { discordService: this.discordService, pagesUrl: this.env.PAGES_URL },
      {
        userId: trackerState.userId,
        guildId: trackerState.guildId,
        channelId: trackerState.channelId,
        queueNumber: trackerState.queueNumber,
        status: trackerState.status,
        isPaused: trackerState.isPaused,
        lastUpdated: currentTime,
        nextCheck: trackerState.status === "active" && !trackerState.isPaused ? nextCheckTime : undefined,
        enrichedMatches,
        seriesScore,
        substitutions: trackerState.substitutions,
        errorState: trackerState.errorState,
      },
    );

    await this.updateChannelName(trackerState, seriesScoreWithEmoji, false);
    await this.updateLiveTrackerMessage(trackerState, liveTrackerEmbed);
  }

  private checkAndHandleStaleLock(trackerState: LiveTrackerState): boolean {
    if (trackerState.refreshInProgress === true && trackerState.refreshStartedAt != null) {
      const refreshStartTime = new Date(trackerState.refreshStartedAt);
      const currentTime = new Date();
      const timeSinceRefreshStart = differenceInMilliseconds(currentTime, refreshStartTime);

      if (timeSinceRefreshStart >= REFRESH_STALE_TIMEOUT_MS) {
        this.logService.warn(
          "Refresh lock is stale, clearing",
          new Map([["staleDurationMs", timeSinceRefreshStart.toString()]]),
        );
        trackerState.refreshInProgress = false;
        trackerState.refreshStartedAt = undefined;
        return false;
      }

      return true;
    }

    return false;
  }

  private async fetchAndMergeSeriesData(trackerState: LiveTrackerState): Promise<LiveTrackerMatchSummary[]> {
    try {
      const teams: SeriesData["teams"] = trackerState.teams.map((team) =>
        team.playerIds.map((playerId) => {
          const player = Preconditions.checkExists(trackerState.players[playerId]);
          return {
            id: playerId,
            username: player.user.username,
            globalName: player.user.global_name ?? null,
            guildNickname: player.nick ?? null,
          };
        }),
      );

      const startDateTime = new Date(trackerState.searchStartTime);
      const endDateTime = new Date();

      // Clear the in-memory caches so each fetch cycle is deterministic on a warm DO instance.
      // playerMatchesCache: ensures we refetch from page 0 of match history
      // userCache: ensures we re-check users even if previously cached as GamesRetrievable.NO
      this.haloService.clearPlayerMatchesCache();
      this.haloService.clearUserCache();

      const matches = await this.haloService.getSeriesFromDiscordQueue(
        {
          teams,
          startDateTime,
          endDateTime,
        },
        true,
      );

      await this.enrichAndMergeMatches(trackerState, matches);

      return Object.values(trackerState.discoveredMatches);
    } catch (error) {
      if (error instanceof EndUserError && error.errorType === EndUserErrorType.WARNING) {
        this.logService.warn("Warning while fetching series data", new Map([["error", error.message]]));

        return Object.values(trackerState.discoveredMatches);
      }
      throw error;
    }
  }

  private async enrichAndMergeMatches(trackerState: LiveTrackerState, matches: MatchStats[]): Promise<void> {
    const trackingPlayers = trackerState.teams.flatMap((team) => team.playerIds);

    for (const match of matches) {
      if (trackerState.discoveredMatches[match.MatchId] != null) {
        continue;
      }

      const startingPlayers = match.Players.filter((player) => player.ParticipationInfo.PresentAtBeginning);
      if (match.Teams.length !== trackerState.teams.length || startingPlayers.length !== trackingPlayers.length) {
        // probably a warm up game, skip it
        continue;
      }

      // Save raw match to KV instead of persisting in DO state
      await this.saveMatchToKV(match.MatchId, match);

      // Track match ID in state
      if (!trackerState.matchIds.includes(match.MatchId)) {
        trackerState.matchIds.push(match.MatchId);
      }

      let gameTypeAndMap = "*Unknown Map and mode*";
      try {
        gameTypeAndMap = await this.haloService.getGameTypeAndMap(match.MatchInfo);
      } catch (error) {
        this.logService.warn(
          "Failed to get gameType and Map",
          new Map([
            ["matchId", match.MatchId],
            ["error", String(error)],
          ]),
        );
      }

      const duration = getReadableDuration(match.MatchInfo.Duration, "en-US");
      const { gameScore, gameSubScore } = this.haloService.getMatchScore(match, "en-US");

      let gameType = "*Unknown Game Type*";
      let gameMap = "*Unknown Map*";

      const colonSplit = gameTypeAndMap.split(":");
      if (colonSplit.length > 1) {
        gameType = colonSplit[0]?.trim() ?? "*Unknown Game Type*";
        gameMap = colonSplit.slice(1).join(":").trim();
      } else {
        const separator = " on ";
        const onIndex = gameTypeAndMap.indexOf(separator);
        if (onIndex > 0) {
          gameType = gameTypeAndMap.slice(0, onIndex).trim();
          gameMap = gameTypeAndMap.slice(onIndex + separator.length).trim();
        }
      }

      const { AssetId, VersionId } = match.MatchInfo.MapVariant;
      const mapThumbnailUrl = await this.haloService.getMapThumbnailUrl(AssetId, VersionId);

      const playerXuidToGametagMap = await this.haloService.getPlayerXuidsToGametags(match);
      const playerXuidToGametag: Record<string, string> = {};
      for (const [xuid, gamertag] of playerXuidToGametagMap.entries()) {
        playerXuidToGametag[xuid] = gamertag;
      }

      const enrichedMatch: LiveTrackerMatchSummary = {
        matchId: match.MatchId,
        gameTypeAndMap,
        gameType,
        gameMap,
        gameMapThumbnailUrl: mapThumbnailUrl ?? "data:,",
        duration,
        gameScore,
        gameSubScore,
        startTime: new Date(match.MatchInfo.StartTime).toISOString(),
        endTime: new Date(match.MatchInfo.EndTime).toISOString(),
        playerXuidToGametag,
      };

      trackerState.discoveredMatches[match.MatchId] = enrichedMatch;
    }
  }

  private hasNewMatchesOrSubstitutions(trackerState: LiveTrackerState): boolean {
    const currentMatchCount = Object.keys(trackerState.discoveredMatches).length;
    const currentSubstitutionCount = trackerState.substitutions.length;

    return (
      currentMatchCount > trackerState.lastMessageState.matchCount ||
      currentSubstitutionCount > trackerState.lastMessageState.substitutionCount
    );
  }

  private async updateLiveTrackerMessage(
    trackerState: LiveTrackerState,
    liveTrackerEmbed: LiveTrackerEmbed,
  ): Promise<void> {
    if (
      this.hasNewMatchesOrSubstitutions(trackerState) ||
      trackerState.liveMessageId == null ||
      trackerState.liveMessageId === ""
    ) {
      const newMessage = await this.discordService.createMessage(
        trackerState.channelId,
        liveTrackerEmbed.toMessageData(),
      );

      if (trackerState.liveMessageId != null && trackerState.liveMessageId !== "") {
        try {
          await this.discordService.deleteMessage(
            trackerState.channelId,
            trackerState.liveMessageId,
            "Replaced with updated live tracker message",
          );
        } catch (deleteError) {
          this.logService.warn(
            "Failed to delete old live tracker message",
            new Map([
              ["oldMessageId", trackerState.liveMessageId],
              ["error", String(deleteError)],
            ]),
          );
        }
      }

      trackerState.liveMessageId = newMessage.id;

      this.logService.info(
        `LiveTracker: Created new live tracker message for queue ${trackerState.queueNumber.toString()} (new matches/substitutions detected)`,
        new Map([
          ["newMessageId", newMessage.id],
          ["matchCount", Object.keys(trackerState.discoveredMatches).length.toString()],
          ["substitutionCount", trackerState.substitutions.length.toString()],
        ]),
      );
    } else {
      await this.discordService.editMessage(
        trackerState.channelId,
        trackerState.liveMessageId,
        liveTrackerEmbed.toMessageData(),
      );

      this.logService.info(
        `LiveTracker: Updated live tracker message for queue ${trackerState.queueNumber.toString()}`,
        new Map([["messageId", trackerState.liveMessageId]]),
      );
    }

    trackerState.lastMessageState.matchCount = Object.keys(trackerState.discoveredMatches).length;
    trackerState.lastMessageState.substitutionCount = trackerState.substitutions.length;
  }

  private async checkChannelManagePermission(trackerState: LiveTrackerState, channel: APIChannel): Promise<boolean> {
    if (trackerState.channelManagePermissionCache != null) {
      return trackerState.channelManagePermissionCache;
    }

    try {
      const [guild, appInGuild] = await Promise.all([
        this.discordService.getGuild(trackerState.guildId),
        this.discordService.getGuildMember(trackerState.guildId, this.env.DISCORD_APP_ID),
      ]);

      const permissions = this.discordService.hasPermissions(guild, channel, appInGuild, [
        PermissionFlagsBits.ManageChannels,
      ]);

      trackerState.channelManagePermissionCache = permissions.hasAll;

      if (!permissions.hasAll) {
        this.logService.info(
          "LiveTracker: Bot lacks ManageChannels permission, disabling channel name updates",
          new Map([
            ["channelId", trackerState.channelId],
            ["guildId", trackerState.guildId],
          ]),
        );

        await this.databaseService.updateGuildConfig(trackerState.guildId, {
          NeatQueueInformerLiveTrackingChannelName: "N",
        });
      }

      return trackerState.channelManagePermissionCache;
    } catch (error) {
      this.logService.warn(
        "LiveTracker: Failed to check permissions for channel name updates",
        new Map([
          ["error", String(error)],
          ["channelId", trackerState.channelId],
        ]),
      );
      trackerState.channelManagePermissionCache = false;
      return false;
    }
  }

  private async updateChannelName(trackerState: LiveTrackerState, seriesScore: string, force: boolean): Promise<void> {
    if (!force && !this.hasNewMatchesOrSubstitutions(trackerState)) {
      return;
    }

    try {
      const guildConfig = await this.databaseService.getGuildConfig(trackerState.guildId);
      if (guildConfig.NeatQueueInformerLiveTrackingChannelName !== "Y") {
        return;
      }

      const channel = await this.discordService.getChannel(trackerState.channelId);
      if (channel.type === ChannelType.DM || channel.type === ChannelType.GroupDM) {
        return;
      }

      const hasPermission = await this.checkChannelManagePermission(trackerState, channel);
      if (!hasPermission) {
        return;
      }

      const { name } = channel;
      const baseChannelName = name.replace(/(┊.+)$/, "");
      // discord does not like spaces, and colons, so we replace them with special characters
      const newChannelName = `${baseChannelName}┊${seriesScore.replace(":", "﹕").replaceAll(" ", "")}`;
      if (name !== newChannelName) {
        await this.discordService.updateChannel(trackerState.channelId, {
          name: newChannelName,
          reason: `Live Tracker: Updated series score to ${seriesScore}`,
        });

        this.logService.info(
          `LiveTracker: Updated channel name for queue ${trackerState.queueNumber.toString()}`,
          new Map([
            ["oldName", name],
            ["newName", newChannelName],
            ["seriesScore", seriesScore],
          ]),
        );
      }
    } catch (error) {
      if (error instanceof DiscordError && error.restError.code === 50001) {
        this.logService.info(
          "LiveTracker: Failed to update channel name due to insufficient permissions",
          new Map([
            ["channelId", trackerState.channelId],
            ["error", error.message],
          ]),
        );

        await this.databaseService.updateGuildConfig(trackerState.guildId, {
          NeatQueueInformerLiveTrackingChannelName: "N",
        });

        return;
      }

      this.logService.error(
        "LiveTracker: Failed to update channel name",
        new Map([
          ["channelId", trackerState.channelId],
          ["error", String(error)],
        ]),
      );
    }
  }

  private async resetChannelName(trackerState: LiveTrackerState): Promise<void> {
    try {
      const guildConfig = await this.databaseService.getGuildConfig(trackerState.guildId);
      if (guildConfig.NeatQueueInformerLiveTrackingChannelName !== "Y") {
        return;
      }

      const channel = await this.discordService.getChannel(trackerState.channelId);
      if (channel.type === ChannelType.DM || channel.type === ChannelType.GroupDM) {
        return;
      }

      const { name } = channel;
      const baseChannelName = name.replace(/ \([^)]+\)$/, "");
      if (name !== baseChannelName) {
        await this.discordService.updateChannel(trackerState.channelId, {
          name: baseChannelName,
          reason: "Live Tracker: Stopped - removed series score",
        });

        this.logService.info(
          `LiveTracker: Reset channel name for queue ${trackerState.queueNumber.toString()}`,
          new Map([
            ["oldName", name],
            ["newName", baseChannelName],
          ]),
        );
      }
    } catch (error) {
      this.logService.warn(
        "LiveTracker: Failed to reset channel name",
        new Map([
          ["channelId", trackerState.channelId],
          ["error", String(error)],
        ]),
      );
    }
  }

  // WebSocket Hibernation API handlers
  async webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Currently read-only - clients receive updates but cannot send commands
    this.logService.debug(
      "LiveTracker: WebSocket message received (ignored)",
      new Map([["messageType", typeof message]]),
    );
    return Promise.resolve();
  }

  async webSocketClose(_ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    try {
      const allWebSockets = this.state.getWebSockets();
      this.logService.debug(
        "LiveTracker: WebSocket client disconnected",
        new Map([
          ["code", code.toString()],
          ["reason", reason],
          ["wasClean", wasClean.toString()],
          ["remainingClients", allWebSockets.length.toString()],
        ]),
      );
    } catch (error) {
      // Log errors but don't fail - WebSocket cleanup should be resilient
      this.logService.error(
        "LiveTracker: Error during WebSocket close",
        new Map([
          ["error", String(error)],
          ["code", code.toString()],
          ["reason", reason],
        ]),
      );
      Sentry.captureException(error);
    }

    return Promise.resolve();
  }

  async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    this.logService.warn("LiveTracker: WebSocket error", new Map([["error", String(error)]]));

    return Promise.resolve();
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    // Check if tracker exists before accepting connection
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response(
        "Tracker not found. Start a tracker first using the /track command in the Discord queue channel.",
        { status: 404 },
      );
    }

    try {
      const data = await this.stateToContractData(trackerState);
      const initialMessage = JSON.stringify({
        type: "state",
        data,
        timestamp: new Date().toISOString(),
      });
      const response = this.webSocketAdapter.upgrade(this.state, initialMessage);
      this.logService.info(
        "LiveTracker: WebSocket client connected",
        new Map([
          ["totalClients", this.state.getWebSockets().length.toString()],
          ["guildId", trackerState.guildId],
          ["channelId", trackerState.channelId],
          ["queueNumber", trackerState.queueNumber.toString()],
        ]),
      );
      return response;
    } catch (error) {
      this.logService.error(
        "LiveTracker: Failed to establish WebSocket",
        new Map([
          ["error", String(error)],
          ["guildId", trackerState.guildId],
          ["queueNumber", trackerState.queueNumber.toString()],
        ]),
      );
      Sentry.captureException(error);
      return new Response("Failed to establish WebSocket connection", { status: 500 });
    }
  }

  private async broadcastStateUpdate(state: LiveTrackerState): Promise<void> {
    if (this.state.getWebSockets().length === 0) {
      return;
    }

    const data = await this.stateToContractData(state);
    const message = JSON.stringify({
      type: "state",
      data,
      timestamp: new Date().toISOString(),
    });

    this.webSocketAdapter.broadcast(this.state, message);
  }

  private async stateToContractData(state: LiveTrackerState): Promise<LiveTrackerStateData> {
    const guild = await this.discordService.getGuild(state.guildId);
    const rawMatches = await this.loadMatchesFromKV(state.matchIds);
    const medalMetadata = await getMedalMetadataFromMatches(rawMatches, async (medalId) =>
      this.haloService.getMedal(medalId),
    );

    return {
      type: "neatqueue",
      guildId: state.guildId,
      guildName: guild.name,
      guildIcon: guild.icon != null ? this.discordService.getGuildIconUrl(guild.id, guild.icon) : null,
      channelId: state.channelId,
      queueNumber: state.queueNumber,
      status: state.status,
      players: Object.values(state.players).map((player) => ({
        id: player.user.id,
        discordUsername: player.nick ?? player.user.global_name ?? player.user.username,
      })),
      teams: state.teams,
      substitutions: state.substitutions.map((sub) => ({
        playerOutId: sub.playerOutId,
        playerInId: sub.playerInId,
        teamIndex: sub.teamIndex,
        teamName: sub.teamName,
        timestamp: sub.timestamp,
      })),
      matchSummaries: Object.values(state.discoveredMatches),
      seriesScore: state.seriesScore,
      lastUpdateTime: state.lastUpdateTime,
      medalMetadata,
      playersAssociationData: state.playersAssociationData,
      rawMatches: rawMatches,
    };
  }

  /**
   * Centralized disposal method for all tracker termination scenarios.
   * Ensures WebSocket clients are notified, resources are cleaned up, and storage is deleted.
   */
  private async dispose(trackerState: LiveTrackerState, reason: string): Promise<void> {
    this.logService.info(
      "LiveTracker: Disposing tracker",
      new Map([
        ["reason", reason],
        ["webSocketClients", this.state.getWebSockets().length.toString()],
      ]),
    );

    trackerState.status = "stopped";
    this.disposed = true;
    await this.broadcastStopMessage(trackerState);

    try {
      await this.resetChannelName(trackerState);
    } catch (error) {
      this.logService.info(
        "LiveTracker: Failed to reset channel name during disposal",
        new Map([["error", String(error)]]),
      );
    }

    // Delete alarm and all storage
    await this.state.storage.deleteAlarm();
    await this.state.storage.deleteAll();
  }

  private async broadcastStopMessage(state: LiveTrackerState): Promise<void> {
    const clientCount = this.state.getWebSockets().length;
    this.logService.info(
      "Notifying WebSocket clients of tracker stop",
      new Map([["clientCount", clientCount.toString()]]),
    );

    if (clientCount === 0) {
      return;
    }

    try {
      // Send final state update with status='stopped' so the frontend receives complete state
      const data = await this.stateToContractData(state);
      const message = JSON.stringify({
        type: "state",
        data,
        timestamp: new Date().toISOString(),
      });

      this.webSocketAdapter.broadcast(this.state, message);
    } catch (error) {
      this.logService.warn("LiveTracker: Failed to build stop message state", new Map([["error", String(error)]]));
    }

    this.webSocketAdapter.closeAll(this.state, 1000, "Tracker stopped");
  }
}
