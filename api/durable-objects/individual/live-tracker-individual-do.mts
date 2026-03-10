/**
 * Live Tracker for Individual Players (Non-NeatQueue)
 *
 * This Durable Object tracks live matches for a single player outside of NeatQueue context.
 * Key differences from NeatQueueLiveTrackerDO:
 * - No team/substitution support
 * - Single player XUID-based tracking
 * - Auto-grouping of custom games by participants
 * - Persistent across all users (keyed by XUID, shared state)
 */

import * as Sentry from "@sentry/cloudflare";
import type { MatchStats } from "halo-infinite-api";
import { MatchType } from "halo-infinite-api";
import { addMilliseconds, differenceInMilliseconds, differenceInMinutes, isAfter, isEqual, max } from "date-fns";
import type { LiveTrackerMatchSummary, LiveTrackerStateData } from "@guilty-spark/contracts/live-tracker/types";
import type { LogService } from "../../services/log/types.mjs";
import type { DiscordService } from "../../services/discord/discord.mjs";
import type { HaloService } from "../../services/halo/halo.mjs";
import { installServices as installServicesImpl } from "../../services/install.mjs";
import { LiveTrackerEmbed } from "../../embeds/live-tracker-embed.mjs";
import { LiveTrackerLoadingEmbed } from "../../embeds/live-tracker-loading-embed.mjs";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error.mjs";
import { DiscordError } from "../../services/discord/discord-error.mjs";
import type { NeatQueueState } from "../../services/neatqueue/types.mjs";
import type {
  LiveTrackerIndividualStartRequest,
  LiveTrackerIndividualWebStartRequest,
  LiveTrackerIndividualWebStartSuccessResponse,
  LiveTrackerIndividualWebStartFailureResponse,
  LiveTrackerIndividualState,
  LiveTrackerIndividualStartResponse,
  LiveTrackerRefreshRequest,
  LiveTrackerRepostRequest,
  LiveTrackerIndividualPauseResponse,
  LiveTrackerIndividualResumeResponse,
  LiveTrackerIndividualStopResponse,
  LiveTrackerIndividualRefreshResponse,
  LiveTrackerIndividualStatusResponse,
  LiveTrackerIndividualRepostResponse,
} from "./types.mjs";

// Production: 3 minutes for live tracking (user-facing display)
const DISPLAY_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes shown to users
const EXECUTION_BUFFER_MS = 8 * 1000; // 8 seconds earlier execution for processing time
const ALARM_INTERVAL_MS = DISPLAY_INTERVAL_MS - EXECUTION_BUFFER_MS; // Execute 8 seconds early

// Inactivity threshold for considering a tracker stale
const STALE_TRACKER_THRESHOLD_MINUTES = 180;

// Error handling constants for exponential backoff
const NORMAL_INTERVAL_MINUTES = 3;
const FIRST_ERROR_INTERVAL_MINUTES = 3;
const CONSECUTIVE_ERROR_INTERVAL_MINUTES = 5;
const MAX_BACKOFF_INTERVAL_MINUTES = 10;
const ERROR_THRESHOLD_MINUTES = 10;

const REFRESH_COOLDOWN_MS = 30 * 1000;
const REFRESH_STALE_TIMEOUT_MS = 1 * 60 * 1000;

export class LiveTrackerIndividualDO implements DurableObject, Rpc.DurableObjectBranded {
  __DURABLE_OBJECT_BRAND = undefined as never;
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private readonly logService: LogService;
  private readonly discordService: DiscordService;
  private readonly haloService: HaloService;

  constructor(state: DurableObjectState, env: Env, installServices = installServicesImpl) {
    this.state = state;
    this.env = env;

    const services = installServices({ env });
    this.logService = services.logService;
    this.discordService = services.discordService;
    this.haloService = services.haloService;
  }

  async fetch(request: Request): Promise<Response> {
    return await Sentry.withScope(async () => {
      const url = new URL(request.url);
      const action = url.pathname.split("/").pop();

      Sentry.setTag("durableObject", "LiveTrackerIndividualDO");
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
          case "web-start": {
            return await this.handleWebStart(request);
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
          case "status": {
            return await this.handleStatus();
          }
          case "repost": {
            return await this.handleRepost(request);
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
        this.logService.error("LiveTrackerIndividualDO fetch error:", new Map([["error", String(error)]]));
        Sentry.captureException(error);
        return new Response("Internal Server Error", { status: 500 });
      }
    });
  }

  async alarm(): Promise<void> {
    await Sentry.withScope(async () => {
      Sentry.setTag("durableObject", "LiveTrackerIndividualDO");
      Sentry.setTag("method", "alarm");

      const trackerState = await this.getState();
      if (trackerState === null) {
        return;
      }

      if (trackerState.status === "stopped") {
        await this.dispose(trackerState, "Tracker stopped, disposing on alarm");
        return;
      }

      if (trackerState.status !== "active" || trackerState.isPaused) {
        return;
      }

      try {
        if (this.checkAndHandleStaleLock(trackerState)) {
          this.logService.debug("Refresh in progress, skipping alarm execution");
          const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
          await this.state.storage.setAlarm(addMilliseconds(new Date(), nextAlarmInterval).getTime());
          return;
        }

        const rawMatches = Object.values(trackerState.rawMatches);
        const lastGameActivityTime =
          rawMatches.length > 0
            ? max(rawMatches.map((m) => m.MatchInfo.EndTime))
            : new Date(trackerState.searchStartTime);
        if (differenceInMinutes(new Date(), lastGameActivityTime) > STALE_TRACKER_THRESHOLD_MINUTES) {
          await this.dispose(trackerState, "Tracker stale, disposing on alarm");
          return;
        }

        trackerState.refreshInProgress = true;
        trackerState.refreshStartedAt = new Date().toISOString();
        await this.setState(trackerState);

        Sentry.setContext("trackerState", {
          xuid: trackerState.xuid,
          gamertag: trackerState.gamertag,
          channelId: trackerState.channelId,
          checkCount: trackerState.checkCount,
          errorCount: trackerState.errorState.consecutiveErrors,
        });

        this.logService.info(
          `LiveTracker Individual: alarm fired for player ${trackerState.gamertag}`,
          new Map([
            ["gamertag", trackerState.gamertag],
            ["channelId", trackerState.channelId],
            ["checkCount", trackerState.checkCount.toString()],
          ]),
        );

        const fetchStartTime = Date.now();
        try {
          await this.executeTrackerUpdate(trackerState);
          const fetchDurationMs = Date.now() - fetchStartTime;
          this.logService.info(
            `LiveTracker Individual: alarm completed for ${trackerState.gamertag} (${fetchDurationMs.toString()}ms)`,
          );
        } catch (error) {
          if (error instanceof DiscordError && (error.httpStatus === 404 || error.restError.code === 10003)) {
            this.logService.warn(
              "LiveTracker Individual: channel not found",
              new Map([["channelId", trackerState.channelId]]),
            );
            await this.dispose(trackerState, "Discord channel not found");
            return;
          }

          if (error instanceof Error && error.message.includes("persistent errors")) {
            return;
          }

          this.logService.error("Failed to update LiveTracker", new Map([["error", String(error)]]));
          this.handleError(trackerState, String(error));
        }

        const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
        await this.state.storage.setAlarm(addMilliseconds(new Date(), nextAlarmInterval).getTime());
      } catch (error) {
        this.logService.error("LiveTracker Individual alarm error:", new Map([["error", String(error)]]));
        Sentry.captureException(error);
      } finally {
        await this.setState({
          ...trackerState,
          refreshInProgress: false,
          refreshStartedAt: undefined,
        }).catch((error: unknown) => {
          this.logService.error("Failed to clear refresh lock", new Map([["error", String(error)]]));
        });
      }
    });
  }

  private async handleStart(request: Request): Promise<Response> {
    const body = await request.json<LiveTrackerIndividualStartRequest>();

    const trackerState: LiveTrackerIndividualState = {
      userId: body.userId,
      xuid: body.xuid,
      gamertag: body.gamertag,
      guildId: body.guildId,
      channelId: body.channelId,
      isPaused: false,
      status: "active",
      liveMessageId: body.liveMessageId,
      startTime: new Date().toISOString(),
      lastUpdateTime: new Date().toISOString(),
      searchStartTime: body.searchStartTime,
      checkCount: 0,
      selectedGameIds: body.selectedGameIds,
      substitutions: [],
      discoveredMatches: {},
      rawMatches: {},
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
      playersAssociationData: body.playersAssociationData,
      matchGroupings: {},
    };

    await this.setState(trackerState);

    try {
      const loadingMessage = await this.createInitialMessage(body);
      trackerState.liveMessageId = loadingMessage.id;
      await this.setState(trackerState);

      const currentTime = new Date();
      const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
      const nextCheckTime = new Date(currentTime.getTime() + nextAlarmInterval + EXECUTION_BUFFER_MS);

      // Fetch initial matches
      const enrichedMatches = await this.fetchAndMergeIndividualMatches(trackerState);
      const rawMatchesArray = Object.values(trackerState.rawMatches);
      const seriesScore = this.haloService.getSeriesScore(rawMatchesArray, "en-US");
      trackerState.seriesScore = seriesScore;

      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService: this.discordService, pagesUrl: this.env.PAGES_URL },
        {
          userId: body.userId,
          guildId: body.guildId,
          channelId: body.channelId,
          queueNumber: 0,
          trackerLabel: body.gamertag,
          status: "active",
          isPaused: false,
          lastUpdated: currentTime,
          nextCheck: nextCheckTime,
          enrichedMatches: enrichedMatches,
          seriesScore,
          substitutions: [],
          errorState: trackerState.errorState,
        },
      );

      await this.discordService.editMessage(body.channelId, loadingMessage.id, liveTrackerEmbed.toMessageData());

      this.logService.info(
        `LiveTracker Individual: Started for ${trackerState.gamertag}`,
        new Map([["messageId", loadingMessage.id]]),
      );

      // Schedule alarm
      const alarmTime = addMilliseconds(new Date(), nextAlarmInterval);
      await this.state.storage.setAlarm(alarmTime.getTime());

      return this.createStartSuccessResponse(trackerState);
    } catch (error) {
      if (error instanceof DiscordError && (error.httpStatus === 404 || error.restError.code === 10003)) {
        this.logService.warn("LiveTracker Individual: channel not found");
        await this.dispose(trackerState, "Channel not found");
        return this.createStartFailureResponse(trackerState);
      }

      this.logService.error("Failed to start individual live tracker", new Map([["error", String(error)]]));
      Sentry.captureException(error);

      return this.createStartFailureResponse(trackerState);
    }
  }

  private async createInitialMessage(startData: LiveTrackerIndividualStartRequest): Promise<{ id: string }> {
    const loadingEmbed = new LiveTrackerLoadingEmbed();
    const loadingEmbedData = {
      embeds: [loadingEmbed.embed],
    };

    if (startData.interactionToken != null && startData.interactionToken !== "") {
      return await this.discordService.updateDeferredReply(startData.interactionToken, loadingEmbedData);
    } else {
      return await this.discordService.createMessage(startData.channelId, loadingEmbedData);
    }
  }

  private async handleWebStart(request: Request): Promise<Response> {
    const body = await request.json<LiveTrackerIndividualWebStartRequest>();

    try {
      // Initialize tracker state without Discord fields
      const trackerState: LiveTrackerIndividualState = {
        userId: "", // No Discord user for web-only tracking
        xuid: body.xuid,
        gamertag: body.gamertag,
        guildId: "", // No guild for web-only tracking
        channelId: "", // No channel for web-only tracking
        isPaused: false,
        status: "active",
        liveMessageId: undefined,
        startTime: new Date().toISOString(),
        lastUpdateTime: new Date().toISOString(),
        searchStartTime: body.searchStartTime,
        checkCount: 0,
        selectedGameIds: body.selectedMatchIds,
        substitutions: [],
        discoveredMatches: {},
        rawMatches: {},
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
        playersAssociationData: null,
        matchGroupings: {},
      };

      await this.setState(trackerState);

      // Fetch initial matches
      const matches = await this.haloService.getMatchDetails(body.selectedMatchIds);

      // Check if player is in an active NeatQueue series
      const activeSeriesId = await this.findPlayerActiveSeriesId(body.xuid);

      // Enrich and merge matches into state
      await this.enrichAndMergeIndividualMatches(trackerState, matches, activeSeriesId ?? undefined);

      // Apply user-provided groupings
      this.applyUserGroupings(trackerState, body.groupings, activeSeriesId ?? undefined);

      // Calculate series score
      const rawMatchesArray = Object.values(trackerState.rawMatches);
      const seriesScore = this.haloService.getSeriesScore(rawMatchesArray, "en-US");
      trackerState.seriesScore = seriesScore;

      await this.setState(trackerState);

      // Schedule alarm
      const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
      const alarmTime = addMilliseconds(new Date(), nextAlarmInterval);
      await this.state.storage.setAlarm(alarmTime.getTime());

      this.logService.info(
        `LiveTracker Individual (Web): Started for ${trackerState.gamertag}`,
        new Map([
          ["gamertag", trackerState.gamertag],
          ["matchCount", Object.keys(trackerState.rawMatches).length.toString()],
          ["groupingCount", Object.keys(trackerState.matchGroupings).length.toString()],
        ]),
      );

      // Return WebSocket URL
      const websocketUrl = `/ws/tracker/individual/${body.gamertag}`;

      return new Response(
        JSON.stringify({
          success: true,
          websocketUrl,
          gamertag: body.gamertag,
        } satisfies LiveTrackerIndividualWebStartSuccessResponse),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      this.logService.error(
        "Failed to start web-based individual tracker",
        new Map([
          ["error", String(error)],
          ["gamertag", body.gamertag],
        ]),
      );
      Sentry.captureException(error);

      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        } satisfies LiveTrackerIndividualWebStartFailureResponse),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  private applyUserGroupings(
    trackerState: LiveTrackerIndividualState,
    userGroupings: string[][],
    seriesId?: { guildId: string; queueNumber: number },
  ): void {
    // Clear any auto-detected groupings
    trackerState.matchGroupings = {};

    // Apply user-provided groupings
    for (let i = 0; i < userGroupings.length; i++) {
      const matchIds = userGroupings[i];
      if (matchIds != null && matchIds.length > 0) {
        // Get the first match's start time to use as group ID
        const firstMatch = trackerState.rawMatches[matchIds[0] ?? ""];
        if (firstMatch == null) {
          continue;
        }

        const groupId = `group_${new Date(firstMatch.MatchInfo.StartTime).getTime().toString()}`;

        // Extract participants from all matches in the group
        const participantsSet = new Set<string>();
        for (const matchId of matchIds) {
          const match = trackerState.rawMatches[matchId];
          if (match != null) {
            const matchParticipants = match.Players.filter((p) => p.PlayerType === 1).map((p) =>
              this.haloService.getPlayerXuid(p),
            );
            for (const participant of matchParticipants) {
              participantsSet.add(participant);
            }
          }
        }

        trackerState.matchGroupings[groupId] = {
          groupId,
          matchIds,
          participants: Array.from(participantsSet),
          ...(seriesId && { seriesId }),
        };
      }
    }
  }

  private async handlePause(): Promise<Response> {
    const trackerState = await this.getState();
    if (trackerState === null) {
      return new Response("Not Found", { status: 404 });
    }

    if (trackerState.status === "stopped") {
      return new Response("Cannot pause stopped tracker", { status: 400 });
    }

    trackerState.isPaused = true;
    trackerState.lastUpdateTime = new Date().toISOString();
    await this.setState(trackerState);

    this.logService.info(`LiveTracker Individual: Paused for ${trackerState.gamertag}`);

    return this.createPauseResponse(trackerState);
  }

  private async handleResume(): Promise<Response> {
    const trackerState = await this.getState();
    if (trackerState === null) {
      return new Response("Not Found", { status: 404 });
    }

    if (trackerState.status === "stopped") {
      return new Response("Cannot resume stopped tracker", { status: 400 });
    }

    trackerState.isPaused = false;
    trackerState.lastUpdateTime = new Date().toISOString();
    await this.setState(trackerState);

    const alarmTime = addMilliseconds(new Date(), ALARM_INTERVAL_MS);
    await this.state.storage.setAlarm(alarmTime.getTime());

    this.logService.info(`LiveTracker Individual: Resumed for ${trackerState.gamertag}`);

    return this.createResumeResponse(trackerState);
  }

  private async handleStop(): Promise<Response> {
    const trackerState = await this.getState();
    if (trackerState === null) {
      return new Response("Not Found", { status: 404 });
    }

    if (trackerState.status === "stopped") {
      return new Response("Tracker already stopped", { status: 400 });
    }

    trackerState.status = "stopped";
    trackerState.lastUpdateTime = new Date().toISOString();
    await this.setState(trackerState);

    this.logService.info(`LiveTracker Individual: Stopped for ${trackerState.gamertag}`);

    await this.dispose(trackerState, "User stopped tracker");

    return this.createStopResponse(trackerState);
  }

  private async handleRefresh(request: Request): Promise<Response> {
    await request.json<LiveTrackerRefreshRequest>();

    const trackerState = await this.getState();
    if (trackerState === null) {
      return new Response("Not Found", { status: 404 });
    }

    if (trackerState.status === "stopped") {
      return new Response("Cannot refresh stopped tracker", { status: 400 });
    }

    const now = new Date();
    if (trackerState.lastRefreshAttempt != null) {
      const lastAttempt = new Date(trackerState.lastRefreshAttempt);
      const timeSinceLastAttempt = now.getTime() - lastAttempt.getTime();

      if (timeSinceLastAttempt < REFRESH_COOLDOWN_MS) {
        const remainingMs = REFRESH_COOLDOWN_MS - timeSinceLastAttempt;
        const remainingSecs = Math.ceil(remainingMs / 1000);
        return this.createRefreshCooldownResponse(
          `Please wait ${remainingSecs.toLocaleString()} seconds before refreshing again.`,
        );
      }
    }

    trackerState.lastRefreshAttempt = now.toISOString();
    await this.setState(trackerState);

    try {
      await this.executeTrackerUpdate(trackerState);
      this.logService.info(`LiveTracker Individual: Manual refresh for ${trackerState.gamertag}`);
      return this.createRefreshSuccessResponse(trackerState);
    } catch (error) {
      this.logService.error("Failed to refresh live tracker", new Map([["error", String(error)]]));
      return this.createRefreshFailureResponse(trackerState);
    }
  }

  private async handleStatus(): Promise<Response> {
    const trackerState = await this.getState();
    if (trackerState === null) {
      return new Response("Not Found", { status: 404 });
    }

    return this.createStatusResponse(trackerState);
  }

  private async handleRepost(request: Request): Promise<Response> {
    const { newMessageId } = await request.json<LiveTrackerRepostRequest>();

    const trackerState = await this.getState();
    if (trackerState === null) {
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
      `LiveTracker Individual: Updated message ID for ${trackerState.gamertag}`,
      new Map([
        ["oldMessageId", oldMessageId ?? "none"],
        ["newMessageId", newMessageId],
      ]),
    );

    return this.createRepostResponse(oldMessageId ?? "none", newMessageId);
  }

  private async getState(): Promise<LiveTrackerIndividualState | null> {
    const state = await this.state.storage.get<LiveTrackerIndividualState>("trackerState");
    return state ?? null;
  }

  private async setState(state: LiveTrackerIndividualState): Promise<void> {
    await this.state.storage.put("trackerState", state);
    await this.broadcastStateUpdate(state);
  }

  // Response helpers
  private createStartSuccessResponse(state: LiveTrackerIndividualState): Response {
    const response: LiveTrackerIndividualStartResponse = { success: true, state };
    return Response.json(response);
  }

  private createStartFailureResponse(state: LiveTrackerIndividualState): Response {
    const response: LiveTrackerIndividualStartResponse = { success: false, state };
    return Response.json(response);
  }

  private createPauseResponse(state: LiveTrackerIndividualState): Response {
    const response: LiveTrackerIndividualPauseResponse = { success: true, state };
    return Response.json(response);
  }

  private createResumeResponse(state: LiveTrackerIndividualState): Response {
    const response: LiveTrackerIndividualResumeResponse = { success: true, state };
    return Response.json(response);
  }

  private createStopResponse(state: LiveTrackerIndividualState): Response {
    const response: LiveTrackerIndividualStopResponse = { success: true, state };
    return Response.json(response);
  }

  private createRefreshSuccessResponse(state: LiveTrackerIndividualState): Response {
    const response: LiveTrackerIndividualRefreshResponse = { success: true, state };
    return Response.json(response);
  }

  private createRefreshCooldownResponse(message: string): Response {
    const response: LiveTrackerIndividualRefreshResponse = {
      success: false,
      error: "cooldown",
      message,
    };
    return new Response(JSON.stringify(response), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  private createRefreshFailureResponse(state: LiveTrackerIndividualState): Response {
    const response: LiveTrackerIndividualRefreshResponse = { success: false, state };
    return Response.json(response);
  }

  private createStatusResponse(state: LiveTrackerIndividualState): Response {
    const response: LiveTrackerIndividualStatusResponse = { state };
    return Response.json(response);
  }

  private createRepostResponse(oldMessageId: string, newMessageId: string): Response {
    const response: LiveTrackerIndividualRepostResponse = {
      success: true,
      oldMessageId,
      newMessageId,
    };
    return Response.json(response);
  }

  private handleError(trackerState: LiveTrackerIndividualState, errorMessage: string): void {
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
        ["gamertag", trackerState.gamertag],
      ]),
    );
  }

  private handleSuccess(trackerState: LiveTrackerIndividualState): void {
    trackerState.errorState.consecutiveErrors = 0;
    trackerState.errorState.backoffMinutes = NORMAL_INTERVAL_MINUTES;
    trackerState.errorState.lastSuccessTime = new Date().toISOString();
    trackerState.errorState.lastErrorMessage = undefined;
  }

  private shouldStopDueToErrors(trackerState: LiveTrackerIndividualState): boolean {
    if (trackerState.errorState.consecutiveErrors === 0) {
      return false;
    }

    const errorDurationMinutes = trackerState.errorState.backoffMinutes * trackerState.errorState.consecutiveErrors;
    return errorDurationMinutes >= ERROR_THRESHOLD_MINUTES;
  }

  private getNextAlarmInterval(trackerState: LiveTrackerIndividualState): number {
    if (trackerState.errorState.consecutiveErrors === 0) {
      return ALARM_INTERVAL_MS;
    }

    return trackerState.errorState.backoffMinutes * 60 * 1000 - EXECUTION_BUFFER_MS;
  }

  private async executeTrackerUpdate(
    trackerState: LiveTrackerIndividualState,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: { skipMessageUpdate?: boolean } = {},
  ): Promise<void> {
    let enrichedMatches: LiveTrackerMatchSummary[] = [];

    try {
      enrichedMatches = await this.fetchAndMergeIndividualMatches(trackerState);
      this.handleSuccess(trackerState);
    } catch (error) {
      this.logService.warn("Failed to fetch matches", new Map([["error", String(error)]]));
      this.handleError(trackerState, String(error));

      if (this.shouldStopDueToErrors(trackerState)) {
        this.logService.error(
          `Stopping tracker due to persistent errors`,
          new Map([["gamertag", trackerState.gamertag]]),
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

    const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
    const nextCheckTime = new Date(currentTime.getTime() + nextAlarmInterval + EXECUTION_BUFFER_MS);

    const rawMatchesArray = Object.values(trackerState.rawMatches);
    const seriesScore = this.haloService.getSeriesScore(rawMatchesArray, "en-US");
    trackerState.seriesScore = seriesScore;

    const liveTrackerEmbed = new LiveTrackerEmbed(
      { discordService: this.discordService, pagesUrl: this.env.PAGES_URL },
      {
        userId: trackerState.userId,
        guildId: trackerState.guildId,
        channelId: trackerState.channelId,
        queueNumber: 0,
        trackerLabel: trackerState.gamertag,
        status: trackerState.status,
        isPaused: trackerState.isPaused,
        lastUpdated: currentTime,
        nextCheck: trackerState.status === "active" && !trackerState.isPaused ? nextCheckTime : undefined,
        enrichedMatches,
        seriesScore,
        substitutions: [],
        errorState: trackerState.errorState,
      },
    );

    await this.updateLiveTrackerMessage(trackerState, liveTrackerEmbed);
  }

  private checkAndHandleStaleLock(trackerState: LiveTrackerIndividualState): boolean {
    if (trackerState.refreshInProgress === true && trackerState.refreshStartedAt != null) {
      const refreshStartTime = new Date(trackerState.refreshStartedAt);
      const currentTime = new Date();
      const timeSinceRefreshStart = differenceInMilliseconds(currentTime, refreshStartTime);

      if (timeSinceRefreshStart >= REFRESH_STALE_TIMEOUT_MS) {
        this.logService.warn("Refresh lock is stale, clearing");
        trackerState.refreshInProgress = false;
        trackerState.refreshStartedAt = undefined;
        return false;
      }

      return true;
    }

    return false;
  }

  private async fetchAndMergeIndividualMatches(
    trackerState: LiveTrackerIndividualState,
  ): Promise<LiveTrackerMatchSummary[]> {
    try {
      const playerMatchHistory = await this.haloService.getRecentMatchHistory(trackerState.gamertag, MatchType.All, 50);

      const searchStartTime = new Date(trackerState.searchStartTime);
      const hasSelectedGames = trackerState.selectedGameIds.length > 0;

      // Extract match IDs and filter to selected games, or all matches since start time
      const selectedMatchIds = playerMatchHistory
        .filter((pmh) => {
          if (hasSelectedGames) {
            return trackerState.selectedGameIds.includes(pmh.MatchId);
          }

          const matchEndTime = new Date(pmh.MatchInfo.EndTime);
          return isAfter(matchEndTime, searchStartTime) || isEqual(matchEndTime, searchStartTime);
        })
        .map((pmh) => pmh.MatchId);

      if (selectedMatchIds.length === 0) {
        return Object.values(trackerState.discoveredMatches);
      }

      // Get full match details
      const matches = await this.haloService.getMatchDetails(selectedMatchIds);

      // Check if player is in an active NeatQueue series
      const activeSeriesId = await this.findPlayerActiveSeriesId(trackerState.xuid);

      await this.enrichAndMergeIndividualMatches(trackerState, matches, activeSeriesId ?? undefined);

      return Object.values(trackerState.discoveredMatches);
    } catch (error) {
      if (error instanceof EndUserError && error.errorType === EndUserErrorType.WARNING) {
        this.logService.warn("Warning while fetching matches", new Map([["error", error.message]]));

        return Object.values(trackerState.discoveredMatches);
      }
      throw error;
    }
  }

  private async findPlayerActiveSeriesId(xuid: string): Promise<{ guildId: string; queueNumber: number } | null> {
    try {
      // Query KV storage for active NeatQueue instances
      // Queue state is stored at: neatqueue:state:{guildId}:{queueNumber}
      const kvList = await this.env.APP_DATA.list<null>({
        prefix: "neatqueue:state:",
      });

      for (const kv of kvList.keys) {
        try {
          // Extract guild ID and queue number from key: neatqueue:state:{guildId}:{queueNumber}
          const parts = kv.name.split(":");
          if (parts.length !== 4) {
            continue;
          }

          const [, , guildId = "", queueNumberStr = ""] = parts;
          if (guildId === "" || queueNumberStr === "") {
            continue;
          }

          const queueNumber = parseInt(queueNumberStr, 10);
          if (Number.isNaN(queueNumber)) {
            continue;
          }

          // Fetch the NeatQueueState which contains the timeline
          const queueState = await this.env.APP_DATA.get<NeatQueueState>(kv.name, {
            type: "json",
          });

          if (queueState?.playersAssociationData == null) {
            continue;
          }

          for (const playerAssociationData of Object.values(queueState.playersAssociationData)) {
            if (playerAssociationData.xboxId === xuid) {
              this.logService.debug(
                "Player association found in NeatQueue state",
                new Map([
                  ["xuid", xuid],
                  ["guildId", guildId],
                  ["queueNumber", queueNumber.toString()],
                ]),
              );

              return { guildId, queueNumber };
            }
          }
        } catch {
          // Skip this KV entry and continue checking others
          continue;
        }
      }

      return null;
    } catch (error) {
      this.logService.warn(
        "Error querying active NeatQueue series",
        new Map([
          ["error", String(error)],
          ["xuid", xuid],
        ]),
      );
      return null;
    }
  }

  private async enrichAndMergeIndividualMatches(
    trackerState: LiveTrackerIndividualState,
    matches: MatchStats[],
    seriesId?: { guildId: string; queueNumber: number },
  ): Promise<void> {
    for (const match of matches) {
      if (trackerState.discoveredMatches[match.MatchId] != null) {
        continue;
      }

      trackerState.rawMatches[match.MatchId] = match;

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

      const duration = this.haloService.getReadableDuration(match.MatchInfo.Duration, "en-US");
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

    this.updateMatchGroupings(trackerState, seriesId);
  }

  private updateMatchGroupings(
    trackerState: LiveTrackerIndividualState,
    seriesId?: { guildId: string; queueNumber: number },
  ): void {
    // Group consecutive custom/local games with same participants
    const groupings: Record<
      string,
      {
        groupId: string;
        matchIds: string[];
        participants: string[];
        seriesId?: { guildId: string; queueNumber: number };
      }
    > = {};

    let currentGroupId = "";
    let currentParticipants: Set<string> | null = null;

    const orderedMatches = Object.values(trackerState.rawMatches).sort(
      (a, b) => new Date(a.MatchInfo.StartTime).getTime() - new Date(b.MatchInfo.StartTime).getTime(),
    );

    for (const match of orderedMatches) {
      // Only group games that are likely custom (check category value)
      // Skip if this is a ranked/social/fiesta match
      const isCustomGame = (match.MatchInfo.GameVariantCategory as unknown as number) >= 30;

      if (!isCustomGame) {
        continue;
      }

      const participants = new Set(
        match.Players.filter((p) => p.PlayerType === 1).map((p) => this.haloService.getPlayerXuid(p)),
      );

      // Check if same participants as current group
      if (
        currentParticipants?.size === participants.size &&
        Array.from(currentParticipants).every((p) => participants.has(p))
      ) {
        // Add to current group
        const group = groupings[currentGroupId];
        if (group) {
          group.matchIds.push(match.MatchId);
        }
      } else {
        // Start new group
        currentGroupId = `group_${new Date(match.MatchInfo.StartTime).getTime().toString()}`;
        currentParticipants = participants;
        groupings[currentGroupId] = {
          groupId: currentGroupId,
          matchIds: [match.MatchId],
          participants: Array.from(participants),
          ...(seriesId && { seriesId }),
        };
      }
    }

    trackerState.matchGroupings = groupings;
  }

  private hasNewMatches(trackerState: LiveTrackerIndividualState): boolean {
    const currentMatchCount = Object.keys(trackerState.discoveredMatches).length;
    return currentMatchCount > trackerState.lastMessageState.matchCount;
  }

  private async updateLiveTrackerMessage(
    trackerState: LiveTrackerIndividualState,
    liveTrackerEmbed: LiveTrackerEmbed,
  ): Promise<void> {
    if (this.hasNewMatches(trackerState) || trackerState.liveMessageId == null || trackerState.liveMessageId === "") {
      const newMessage = await this.discordService.createMessage(
        trackerState.channelId,
        liveTrackerEmbed.toMessageData(),
      );

      if (trackerState.liveMessageId != null && trackerState.liveMessageId !== "") {
        try {
          await this.discordService.deleteMessage(
            trackerState.channelId,
            trackerState.liveMessageId,
            "Replaced with updated tracker message",
          );
        } catch (deleteError) {
          this.logService.warn("Failed to delete old message", new Map([["error", String(deleteError)]]));
        }
      }

      trackerState.liveMessageId = newMessage.id;
      this.logService.info(
        `LiveTracker Individual: Created new message for ${trackerState.gamertag}`,
        new Map([["newMessageId", newMessage.id]]),
      );
    } else {
      await this.discordService.editMessage(
        trackerState.channelId,
        trackerState.liveMessageId,
        liveTrackerEmbed.toMessageData(),
      );

      this.logService.info(`LiveTracker Individual: Updated message for ${trackerState.gamertag}`);
    }

    trackerState.lastMessageState.matchCount = Object.keys(trackerState.discoveredMatches).length;
  }

  // WebSocket handlers
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    return Promise.resolve();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async webSocketClose(_ws: WebSocket, code: number, reason: string, _wasClean: boolean): Promise<void> {
    const allWebSockets = this.state.getWebSockets();
    this.logService.debug(
      "LiveTracker Individual: WebSocket client disconnected",
      new Map([
        ["code", code.toString()],
        ["reason", reason],
        ["remainingClients", allWebSockets.length.toString()],
      ]),
    );

    return Promise.resolve();
  }

  async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    this.logService.warn("LiveTracker Individual: WebSocket error", new Map([["error", String(error)]]));

    return Promise.resolve();
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const trackerState = await this.getState();
    if (trackerState === null) {
      return new Response("Tracker not found. Start a tracker first.", { status: 404 });
    }

    const webSocketPair = new WebSocketPair();
    const client = webSocketPair[0];
    const server = webSocketPair[1];

    this.state.acceptWebSocket(server);

    const allWebSockets = this.state.getWebSockets();
    this.logService.info(
      "LiveTracker Individual: WebSocket client connected",
      new Map([
        ["totalClients", allWebSockets.length.toString()],
        ["gamertag", trackerState.gamertag],
      ]),
    );

    // Send current state immediately on connection
    const data = await this.stateToContractData(trackerState);
    server.send(
      JSON.stringify({
        type: "state",
        data,
        timestamp: new Date().toISOString(),
      }),
    );

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async broadcastStateUpdate(state: LiveTrackerIndividualState): Promise<void> {
    const allWebSockets = this.state.getWebSockets();
    if (allWebSockets.length === 0) {
      return;
    }

    const data = await this.stateToContractData(state);
    const message = JSON.stringify({
      type: "state",
      data,
      timestamp: new Date().toISOString(),
    });

    for (const client of allWebSockets) {
      try {
        client.send(message);
      } catch (error) {
        this.logService.warn(
          "LiveTracker Individual: Failed to send to WebSocket",
          new Map([["error", String(error)]]),
        );
      }
    }
  }

  private async stateToContractData(state: LiveTrackerIndividualState): Promise<LiveTrackerStateData> {
    const guild = await this.discordService.getGuild(state.guildId);
    const medalMetadata = await this.getMedalMetadataFromMatches(state.rawMatches);

    const matchGroupings = Object.entries(state.matchGroupings).reduce<
      Record<
        string,
        {
          groupId: string;
          matchIds: string[];
          seriesId?: {
            guildId: string;
            queueNumber: number;
          };
        }
      >
    >((acc, [groupId, grouping]) => {
      const groupData: {
        groupId: string;
        matchIds: string[];
        seriesId?: {
          guildId: string;
          queueNumber: number;
        };
      } = {
        groupId: grouping.groupId,
        matchIds: grouping.matchIds,
      };
      if (grouping.seriesId !== undefined) {
        groupData.seriesId = grouping.seriesId;
      }
      acc[groupId] = groupData;
      return acc;
    }, {});

    return {
      guildId: state.guildId,
      guildName: guild.name,
      channelId: state.channelId,
      queueNumber: 0,
      status: state.status,
      players: [],
      teams: [],
      substitutions: [],
      discoveredMatches: Object.values(state.discoveredMatches),
      rawMatches: state.rawMatches,
      seriesScore: state.seriesScore,
      lastUpdateTime: state.lastUpdateTime,
      medalMetadata,
      playersAssociationData: state.playersAssociationData,
      matchGroupings,
    };
  }

  private async getMedalMetadataFromMatches(
    rawMatches: Record<string, MatchStats>,
  ): Promise<Record<number, { name: string; sortingWeight: number }>> {
    const medalIds = new Set<number>();
    for (const match of Object.values(rawMatches)) {
      for (const team of match.Teams) {
        for (const medal of team.Stats.CoreStats.Medals) {
          medalIds.add(medal.NameId);
        }
      }
      for (const player of match.Players) {
        for (const teamStats of player.PlayerTeamStats) {
          for (const medal of teamStats.Stats.CoreStats.Medals) {
            medalIds.add(medal.NameId);
          }
        }
      }
    }

    const medalMetadata: Record<number, { name: string; sortingWeight: number }> = {};
    for (const medalId of medalIds) {
      const medal = await this.haloService.getMedal(medalId);
      if (medal != null) {
        medalMetadata[medalId] = {
          name: medal.name,
          sortingWeight: medal.sortingWeight,
        };
      }
    }

    return medalMetadata;
  }

  private async dispose(trackerState: LiveTrackerIndividualState | null, reason: string): Promise<void> {
    const allWebSockets = this.state.getWebSockets();
    this.logService.info(
      "LiveTracker Individual: Disposing tracker",
      new Map([
        ["reason", reason],
        ["hasState", trackerState != null ? "true" : "false"],
        ["webSocketClients", allWebSockets.length.toString()],
      ]),
    );

    if (trackerState) {
      await this.broadcastStopMessage(trackerState);
    } else if (allWebSockets.length > 0) {
      for (const client of allWebSockets) {
        try {
          client.close(1011, "Tracker disposed");
        } catch (error) {
          this.logService.info(
            "LiveTracker Individual: Failed to close WebSocket",
            new Map([["error", String(error)]]),
          );
        }
      }
    }

    await this.state.storage.deleteAlarm();
    await this.state.storage.deleteAll();
  }

  private async broadcastStopMessage(state: LiveTrackerIndividualState): Promise<void> {
    const allWebSockets = this.state.getWebSockets();

    this.logService.info(
      "LiveTracker Individual: Notifying WebSocket clients of stop",
      new Map([["clientCount", allWebSockets.length.toString()]]),
    );

    try {
      const data = await this.stateToContractData(state);
      const message = JSON.stringify({
        type: "state",
        data,
        timestamp: new Date().toISOString(),
      });

      for (const client of allWebSockets) {
        try {
          client.send(message);
          client.close(1000, "Tracker stopped");
        } catch (error) {
          this.logService.warn(
            "LiveTracker Individual: Failed to notify WebSocket client",
            new Map([["error", String(error)]]),
          );
        }
      }
    } catch (error) {
      this.logService.warn("LiveTracker Individual: Failed to build stop message", new Map([["error", String(error)]]));
      for (const client of allWebSockets) {
        try {
          client.close(1000, "Tracker stopped");
        } catch (closeError) {
          this.logService.warn(
            "LiveTracker Individual: Failed to close WebSocket client",
            new Map([["error", String(closeError)]]),
          );
        }
      }
    }
  }
}
