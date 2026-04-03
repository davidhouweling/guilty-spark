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
import { getReadableDuration } from "@guilty-spark/shared/halo/duration";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-utils";
import {
  addMilliseconds,
  differenceInMilliseconds,
  differenceInMinutes,
  isAfter,
  isEqual,
  max,
  subMinutes,
} from "date-fns";
import type {
  LiveTrackerMatchSummary,
  PlayerAssociationData,
  LiveTrackerIndividualStateData,
  LiveTrackerIndividualGroup,
  LiveTrackerNeatQueueSeriesGroup,
  LiveTrackerManualMatchGroup,
  LiveTrackerSingleMatchGroup,
} from "@guilty-spark/contracts/live-tracker/types";
import type { SeriesData, SeriesId } from "@guilty-spark/contracts/live-tracker/series-types";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { LogService } from "../../services/log/types.mjs";
import type { DiscordService } from "../../services/discord/discord.mjs";
import type { HaloService } from "../../services/halo/halo.mjs";
import { installServices as installServicesImpl } from "../../services/install.mjs";
import { LiveTrackerEmbed } from "../../embeds/live-tracker-embed.mjs";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error.mjs";
import { DiscordError } from "../../services/discord/discord-error.mjs";
import type { NeatQueueState } from "../../services/neatqueue/types.mjs";
import type {
  LiveTrackerIndividualStartRequest,
  LiveTrackerIndividualWebStartRequest,
  LiveTrackerIndividualWebStartSuccessResponse,
  LiveTrackerIndividualWebStartFailureResponse,
  LiveTrackerIndividualSubscribeSuccessResponse,
  LiveTrackerIndividualSubscribeFailureResponse,
  LiveTrackerIndividualUnsubscribeRequest,
  LiveTrackerIndividualUnsubscribeSuccessResponse,
  LiveTrackerIndividualUnsubscribeFailureResponse,
  LiveTrackerIndividualTargetsResponse,
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
  UpdateTarget,
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
          case "subscribe": {
            return await this.handleSubscribe(request);
          }
          case "unsubscribe": {
            return await this.handleUnsubscribe(request);
          }
          case "targets": {
            return await this.handleGetTargets();
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
          xuid: trackerState.xuid,
          gamertag: trackerState.gamertag,
          checkCount: trackerState.checkCount,
          errorCount: trackerState.errorState.consecutiveErrors,
          targetCount: trackerState.updateTargets.length,
        });

        this.logService.info(
          `LiveTracker Individual: alarm fired for player ${trackerState.gamertag}`,
          new Map([
            ["gamertag", trackerState.gamertag],
            ["targetCount", trackerState.updateTargets.length.toString()],
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
              "LiveTracker Individual: Discord error (target will be removed by broadcast system)",
              new Map([["errorCode", error.restError.code.toString()]]),
            );
            // Don't dispose entire tracker - let broadcast system handle target removal
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
      xuid: body.xuid,
      gamertag: body.gamertag,
      isPaused: false,
      status: "active",
      updateTargets: body.initialTarget != null ? [body.initialTarget] : [],
      startTime: new Date().toISOString(),
      lastUpdateTime: new Date().toISOString(),
      searchStartTime: body.searchStartTime,
      checkCount: 0,
      selectedGameIds: body.selectedGameIds,
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
      playersAssociationData: body.playersAssociationData,
      matchGroupings: {},
    };

    try {
      // Fetch initial matches
      await this.fetchAndMergeIndividualMatches(trackerState);
      await this.computeAndUpdateSeriesScore(trackerState);

      // Persist and broadcast initial state
      await this.setState(trackerState);

      this.logService.info(
        `LiveTracker Individual: Started for ${trackerState.gamertag}`,
        new Map([["targetCount", trackerState.updateTargets.length.toString()]]),
      );

      // Schedule alarm
      const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
      const alarmTime = addMilliseconds(new Date(), nextAlarmInterval);
      await this.state.storage.setAlarm(alarmTime.getTime());

      return this.createStartSuccessResponse(trackerState);
    } catch (error) {
      this.logService.error("Failed to start individual live tracker", new Map([["error", String(error)]]));
      Sentry.captureException(error);

      await this.dispose(trackerState, "Failed to start");
      return this.createStartFailureResponse(trackerState);
    }
  }

  private async handleWebStart(request: Request): Promise<Response> {
    const body = await request.json<LiveTrackerIndividualWebStartRequest>();

    try {
      // Initialize tracker state for web-only tracking (no Discord)
      const trackerState: LiveTrackerIndividualState = {
        xuid: body.xuid,
        gamertag: body.gamertag,
        isPaused: false,
        status: "active",
        updateTargets: [],
        startTime: new Date().toISOString(),
        lastUpdateTime: new Date().toISOString(),
        searchStartTime: body.searchStartTime,
        checkCount: 0,
        selectedGameIds: body.selectedMatchIds,
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
      await this.applyUserGroupings(trackerState, body.groupings, activeSeriesId ?? undefined);

      // Calculate series score
      await this.computeAndUpdateSeriesScore(trackerState);

      await this.setState(trackerState);

      // Schedule alarm
      const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
      const alarmTime = addMilliseconds(new Date(), nextAlarmInterval);
      await this.state.storage.setAlarm(alarmTime.getTime());

      this.logService.info(
        `LiveTracker Individual (Web): Started for ${trackerState.gamertag}`,
        new Map([
          ["gamertag", trackerState.gamertag],
          ["matchCount", trackerState.matchIds.length.toString()],
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

  private async applyUserGroupings(
    trackerState: LiveTrackerIndividualState,
    userGroupings: string[][],
    seriesId?: { guildId: string; queueNumber: number },
  ): Promise<void> {
    // Clear any auto-detected groupings
    trackerState.matchGroupings = {};

    // Load all matches from KV
    const rawMatches = await this.loadMatchesFromKV(trackerState.matchIds);

    // Apply user-provided groupings
    for (const matchIds of userGroupings) {
      if (matchIds.length > 0) {
        // Get the first match's start time to use as group ID
        const firstMatch = rawMatches[matchIds[0] ?? ""];
        if (firstMatch == null) {
          continue;
        }

        const groupId = `group_${new Date(firstMatch.MatchInfo.StartTime).getTime().toString()}`;

        // Extract participants from all matches in the group
        const participantsSet = new Set<string>();
        for (const matchId of matchIds) {
          const match = rawMatches[matchId];
          if (match != null) {
            const matchParticipants = match.Players.filter((p) => p.PlayerType === 1).map((p) => getPlayerXuid(p));
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

      // Persist and broadcast the updated state
      await this.setState(trackerState);

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

    const discordTargets = trackerState.updateTargets.filter((t) => t.type === "discord");

    if (discordTargets.length === 0) {
      return new Response("No Discord targets found", { status: 404 });
    }

    // Update the first/oldest Discord target (preserves original repost behavior)
    const [targetToUpdate] = discordTargets;
    if (!targetToUpdate?.discord) {
      return new Response("Invalid Discord target", { status: 500 });
    }

    const oldMessageId = targetToUpdate.discord.messageId;
    targetToUpdate.discord.messageId = newMessageId;

    trackerState.lastUpdateTime = new Date().toISOString();

    await this.setState(trackerState);

    this.logService.info(
      `LiveTracker Individual: Updated message ID for ${trackerState.gamertag}`,
      new Map([
        ["targetId", targetToUpdate.id],
        ["oldMessageId", oldMessageId ?? "none"],
        ["newMessageId", newMessageId],
      ]),
    );

    return this.createRepostResponse(oldMessageId ?? "none", newMessageId);
  }

  private async handleSubscribe(request: Request): Promise<Response> {
    const trackerState = await this.getState();
    if (trackerState === null) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Tracker not found",
        } satisfies LiveTrackerIndividualSubscribeFailureResponse),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      const body = await request.json<{ target: unknown }>();

      // Validate target structure at runtime (can't trust JSON input)
      if (
        typeof body.target !== "object" ||
        body.target === null ||
        !("id" in body.target) ||
        !("type" in body.target) ||
        typeof body.target.id !== "string" ||
        body.target.id === "" ||
        typeof body.target.type !== "string"
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid target data",
          } satisfies LiveTrackerIndividualSubscribeFailureResponse),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const target = body.target as UpdateTarget;

      // Check if target ID already exists
      const existingTarget = trackerState.updateTargets.find((t) => t.id === target.id);
      if (existingTarget != null) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Target ID already exists",
          } satisfies LiveTrackerIndividualSubscribeFailureResponse),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }

      // Add the new target
      trackerState.updateTargets.push(target);

      // Persist and broadcast
      await this.setState(trackerState);

      this.logService.info(
        `LiveTracker Individual: Added subscription for ${trackerState.gamertag}`,
        new Map([
          ["targetId", target.id],
          ["targetType", target.type],
          ["totalTargets", trackerState.updateTargets.length.toString()],
        ]),
      );

      return new Response(
        JSON.stringify({
          success: true,
          targetId: target.id,
          state: trackerState,
        } satisfies LiveTrackerIndividualSubscribeSuccessResponse),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      this.logService.error("Failed to add subscription", new Map([["error", String(error)]]));
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        } satisfies LiveTrackerIndividualSubscribeFailureResponse),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  private async handleUnsubscribe(request: Request): Promise<Response> {
    const trackerState = await this.getState();
    if (trackerState === null) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Tracker not found",
        } satisfies LiveTrackerIndividualUnsubscribeFailureResponse),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      const body = await request.json<LiveTrackerIndividualUnsubscribeRequest>();

      if (!body.targetId || body.targetId.trim() === "") {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Target ID is required",
          } satisfies LiveTrackerIndividualUnsubscribeFailureResponse),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Find target to remove
      const targetIndex = trackerState.updateTargets.findIndex((t) => t.id === body.targetId);
      if (targetIndex === -1) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Target not found",
          } satisfies LiveTrackerIndividualUnsubscribeFailureResponse),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }

      // Remove the target
      trackerState.updateTargets.splice(targetIndex, 1);

      // If no targets remain, stop the tracker
      if (trackerState.updateTargets.length === 0) {
        this.logService.info(
          `LiveTracker Individual: Last target removed, stopping tracker for ${trackerState.gamertag}`,
        );

        // Update status and persist before disposing
        trackerState.status = "stopped";
        trackerState.lastUpdateTime = new Date().toISOString();
        await this.setState(trackerState);
        await this.dispose(trackerState, "All targets removed");

        return new Response(
          JSON.stringify({
            success: true,
            targetId: body.targetId,
            state: trackerState,
          } satisfies LiveTrackerIndividualUnsubscribeSuccessResponse),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Persist and broadcast (target removed but tracker continues)
      await this.setState(trackerState);

      this.logService.info(
        `LiveTracker Individual: Removed subscription for ${trackerState.gamertag}`,
        new Map([
          ["targetId", body.targetId],
          ["remainingTargets", trackerState.updateTargets.length.toString()],
        ]),
      );

      return new Response(
        JSON.stringify({
          success: true,
          targetId: body.targetId,
          state: trackerState,
        } satisfies LiveTrackerIndividualUnsubscribeSuccessResponse),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      this.logService.error("Failed to remove subscription", new Map([["error", String(error)]]));
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        } satisfies LiveTrackerIndividualUnsubscribeFailureResponse),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  private async handleGetTargets(): Promise<Response> {
    const trackerState = await this.getState();
    if (trackerState === null) {
      return new Response("Tracker not found", { status: 404 });
    }

    return new Response(
      JSON.stringify({
        success: true,
        targets: trackerState.updateTargets,
      } satisfies LiveTrackerIndividualTargetsResponse),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  private async getState(): Promise<LiveTrackerIndividualState | null> {
    const state = await this.state.storage.get<LiveTrackerIndividualState>("trackerState");
    return state ?? null;
  }

  private async setState(state: LiveTrackerIndividualState): Promise<void> {
    await this.state.storage.put("trackerState", state);
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
  private async computeAndUpdateSeriesScore(trackerState: LiveTrackerIndividualState): Promise<string> {
    const rawMatches = await this.loadMatchesFromKV(trackerState.matchIds);
    const rawMatchesArray = Object.values(rawMatches);
    const seriesScore = this.haloService.getSeriesScore(rawMatchesArray, "en-US");
    trackerState.seriesScore = seriesScore;
    return seriesScore;
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
    try {
      await this.fetchAndMergeIndividualMatches(trackerState);
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
    trackerState.lastUpdateTime = new Date().toISOString();

    // Load matches from KV to compute series score
    await this.computeAndUpdateSeriesScore(trackerState);

    // Note: Caller must call setState() after this method to persist and broadcast updates
    // Alarm handler does this in finally block, handleRefresh() does this after execution
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

      // Fetch and cache series data if player is in an active NeatQueue series
      if (activeSeriesId != null) {
        const seriesData = await this.fetchSeriesDataFromNeatQueueDO(activeSeriesId);

        if (seriesData != null) {
          const now = new Date().toISOString();

          if (trackerState.seriesLink == null) {
            trackerState.seriesLink = {
              seriesId: activeSeriesId,
              linkedAt: now,
              lastFetchedAt: now,
            };
            this.logService.info(
              "Linked individual tracker to NeatQueue series",
              new Map([
                ["xuid", trackerState.xuid],
                ["gamertag", trackerState.gamertag],
                ["guildId", activeSeriesId.guildId],
                ["queueNumber", activeSeriesId.queueNumber.toString()],
              ]),
            );
          } else {
            trackerState.seriesLink = {
              ...trackerState.seriesLink,
              lastFetchedAt: now,
            };
          }

          trackerState.seriesData = seriesData;
          this.logService.debug(
            "Updated series data from NeatQueue DO",
            new Map([
              ["gamertag", trackerState.gamertag],
              ["matchCount", seriesData.matchIds.length.toString()],
            ]),
          );
        } else if (trackerState.seriesData != null) {
          // Series is no longer active (404/410) but we have cached data - keep it
          this.logService.info(
            "NeatQueue series completed, preserving cached series data",
            new Map([
              ["gamertag", trackerState.gamertag],
              ["guildId", activeSeriesId.guildId],
              ["queueNumber", activeSeriesId.queueNumber.toString()],
            ]),
          );
        }
      }

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

  private async fetchSeriesDataFromNeatQueueDO(seriesId: SeriesId): Promise<SeriesData | null> {
    try {
      const doId = this.env.LIVE_TRACKER_DO.idFromName(`${seriesId.guildId}:${seriesId.queueNumber.toString()}`);
      const doStub = this.env.LIVE_TRACKER_DO.get(doId);

      const response = await doStub.fetch("http://do/series-data", {
        method: "GET",
      });

      if (response.status === 404) {
        this.logService.debug(
          "NeatQueue series not found",
          new Map([
            ["guildId", seriesId.guildId],
            ["queueNumber", seriesId.queueNumber.toString()],
          ]),
        );
        return null;
      }

      if (response.status === 410) {
        this.logService.debug(
          "NeatQueue series is stopped",
          new Map([
            ["guildId", seriesId.guildId],
            ["queueNumber", seriesId.queueNumber.toString()],
          ]),
        );
        return null;
      }

      if (!response.ok) {
        this.logService.warn(
          "Failed to fetch series data from NeatQueue DO",
          new Map([
            ["status", response.status.toString()],
            ["guildId", seriesId.guildId],
            ["queueNumber", seriesId.queueNumber.toString()],
          ]),
        );
        return null;
      }

      const rawSeriesData = await response.json<{
        seriesId: SeriesId;
        teams: { name: string; playerIds: string[] }[];
        seriesScore: string;
        matchIds: string[];
        discoveredMatches: Record<string, LiveTrackerMatchSummary>;
        rawMatches: Record<string, MatchStats>;
        playersAssociationData: Record<string, PlayerAssociationData>;
        substitutions: {
          playerOutId: string;
          playerInId: string;
          teamIndex: number;
          teamName: string;
          timestamp: string;
        }[];
        startTime: string;
        lastUpdateTime: string;
      }>();

      const seriesData: SeriesData = {
        seriesId: rawSeriesData.seriesId,
        teams: rawSeriesData.teams,
        seriesScore: rawSeriesData.seriesScore,
        matchIds: rawSeriesData.matchIds,
        discoveredMatches: new Map(Object.entries(rawSeriesData.discoveredMatches)),
        playersAssociationData: rawSeriesData.playersAssociationData,
        substitutions: rawSeriesData.substitutions,
        startTime: rawSeriesData.startTime,
        lastUpdateTime: rawSeriesData.lastUpdateTime,
      };

      this.logService.debug(
        "Successfully fetched series data from NeatQueue DO",
        new Map([
          ["guildId", seriesId.guildId],
          ["queueNumber", seriesId.queueNumber.toString()],
          ["matchCount", seriesData.matchIds.length.toString()],
        ]),
      );

      return seriesData;
    } catch (error) {
      this.logService.warn(
        "Error fetching series data from NeatQueue DO",
        new Map([
          ["error", String(error)],
          ["guildId", seriesId.guildId],
          ["queueNumber", seriesId.queueNumber.toString()],
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

    await this.updateMatchGroupings(trackerState, seriesId);
  }

  private async updateMatchGroupings(
    trackerState: LiveTrackerIndividualState,
    seriesId?: { guildId: string; queueNumber: number },
  ): Promise<void> {
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

    // Load matches from KV
    const rawMatches = await this.loadMatchesFromKV(trackerState.matchIds);
    const orderedMatches = Object.values(rawMatches).sort(
      (a, b) => new Date(a.MatchInfo.StartTime).getTime() - new Date(b.MatchInfo.StartTime).getTime(),
    );

    for (const match of orderedMatches) {
      // Only group games that are likely custom (check category value)
      // Skip if this is a ranked/social/fiesta match
      const isCustomGame = (match.MatchInfo.GameVariantCategory as unknown as number) >= 30;

      if (!isCustomGame) {
        continue;
      }

      const participants = new Set(match.Players.filter((p) => p.PlayerType === 1).map((p) => getPlayerXuid(p)));

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

  // WebSocket handlers
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    return Promise.resolve();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean): Promise<void> {
    try {
      const trackerState = await this.getState();
      if (trackerState !== null) {
        // Get tags attached to this WebSocket
        // In some edge cases (e.g., WebSocket closes before being properly accepted),
        // getTags may return an empty array or the operation may fail
        try {
          const tags = this.state.getTags(ws);
          const [targetId] = tags;

          if (targetId != null) {
            const beforeCount = trackerState.updateTargets.length;
            trackerState.updateTargets = trackerState.updateTargets.filter((t) => t.id !== targetId);
            const afterCount = trackerState.updateTargets.length;

            if (beforeCount > afterCount) {
              await this.setState(trackerState);

              this.logService.info(
                "LiveTracker Individual: Removed WebSocket target",
                new Map([
                  ["targetId", targetId],
                  ["remainingTargets", afterCount.toString()],
                ]),
              );
            }
          }
        } catch (tagError) {
          // Log but don't fail - WebSocket may have closed before being properly tagged
          this.logService.warn(
            "LiveTracker Individual: Failed to get tags from closing WebSocket",
            new Map([["error", String(tagError)]]),
          );
        }
      }

      const allWebSockets = this.state.getWebSockets();
      this.logService.debug(
        "LiveTracker Individual: WebSocket client disconnected",
        new Map([
          ["code", code.toString()],
          ["reason", reason],
          ["remainingClients", allWebSockets.length.toString()],
        ]),
      );
    } catch (error) {
      // Log errors but don't fail - WebSocket cleanup should be resilient
      this.logService.error(
        "LiveTracker Individual: Error during WebSocket close",
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

    const targetId = `websocket-${Date.now().toString()}-${Math.random().toString(36).substring(7)}`;

    try {
      // Accept WebSocket first to ensure tags are set before any potential close events
      this.state.acceptWebSocket(server, [targetId]);

      // Add to update targets and save state
      trackerState.updateTargets.push({
        id: targetId,
        type: "websocket",
        createdAt: new Date().toISOString(),
        websocket: {
          sessionId: targetId,
        },
      });

      await this.setState(trackerState);

      const allWebSockets = this.state.getWebSockets();
      this.logService.info(
        "LiveTracker Individual: WebSocket client connected",
        new Map([
          ["targetId", targetId],
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
    } catch (error) {
      this.logService.error(
        "LiveTracker Individual: Failed to establish WebSocket",
        new Map([
          ["error", String(error)],
          ["targetId", targetId],
          ["gamertag", trackerState.gamertag],
        ]),
      );
      Sentry.captureException(error);

      // Close the WebSocket if setup failed
      try {
        server.close(1011, "Internal error");
      } catch {
        // Ignore errors during cleanup
      }

      return new Response("Failed to establish WebSocket connection", { status: 500 });
    }
  }

  private shouldRemoveTarget(target: UpdateTarget, error: unknown): boolean {
    switch (target.type) {
      case "websocket":
        // WebSocket: always remove on send failure (expect reconnect)
        return true;
      case "discord":
        if (error instanceof DiscordError) {
          // Discord permanent errors (unknown resources, missing permissions)
          const permanentErrorCodes = [
            10003, // Unknown Channel
            10004, // Unknown Guild
            10008, // Unknown Message
            10062, // Unknown Interaction
            50001, // Missing Access
          ];

          if (permanentErrorCodes.includes(error.restError.code)) {
            return true;
          }

          // 404 without specific code also indicates unknown resource
          if (error.httpStatus === 404) {
            return true;
          }
        }

        // All other errors are transient (rate limits, 5xx, network issues)
        return false;
      default:
        throw new UnreachableError(target.type);
    }
  }

  private async updateDiscordTarget(state: LiveTrackerIndividualState, target: UpdateTarget): Promise<void> {
    if (!target.discord) {
      throw new Error("Discord target missing discord fields");
    }

    const { channelId, messageId } = target.discord;

    if (messageId == null) {
      // No message ID yet - skip update (message will be created during Discord start flow)
      return;
    }

    // Build data object for embed
    const currentTime = new Date();
    const nextAlarmInterval = this.getNextAlarmInterval(state);
    const nextCheckTime = new Date(currentTime.getTime() + nextAlarmInterval + EXECUTION_BUFFER_MS);

    const liveTrackerEmbed = new LiveTrackerEmbed(
      { discordService: this.discordService, pagesUrl: this.env.PAGES_URL },
      {
        userId: target.discord.userId,
        guildId: target.discord.guildId,
        channelId: target.discord.channelId,
        queueNumber: 0,
        trackerLabel: state.gamertag,
        status: state.status,
        isPaused: state.isPaused,
        lastUpdated: currentTime,
        nextCheck: state.status === "active" && !state.isPaused ? nextCheckTime : undefined,
        enrichedMatches: Object.values(state.discoveredMatches),
        seriesScore: state.seriesScore,
        substitutions: [],
        errorState: state.errorState,
        seriesData: state.seriesData
          ? {
              seriesId: state.seriesData.seriesId,
              teams: state.seriesData.teams,
              seriesScore: state.seriesData.seriesScore,
              matchIds: Array.from(state.seriesData.matchIds),
              startTime: state.seriesData.startTime,
              lastUpdateTime: state.seriesData.lastUpdateTime,
            }
          : undefined,
      },
    );

    const currentMatchCount = Object.keys(state.discoveredMatches).length;
    const hasNewMatches = currentMatchCount > target.discord.lastMatchCount;

    if (hasNewMatches) {
      const newMessage = await this.discordService.createMessage(channelId, liveTrackerEmbed.toMessageData());

      try {
        await this.discordService.deleteMessage(channelId, messageId, "Replaced with updated tracker message");
      } catch (deleteError) {
        this.logService.warn("Failed to delete old Discord message", new Map([["error", String(deleteError)]]));
      }

      target.discord.messageId = newMessage.id;
      target.discord.lastMatchCount = currentMatchCount;

      this.logService.info(
        `LiveTracker Individual: Created new Discord message for ${state.gamertag}`,
        new Map([
          ["targetId", target.id],
          ["newMessageId", newMessage.id],
          ["matchCount", currentMatchCount.toString()],
        ]),
      );
    } else {
      await this.discordService.editMessage(channelId, messageId, liveTrackerEmbed.toMessageData());
      target.discord.lastMatchCount = currentMatchCount;
    }
  }

  private async updateWebSocketTarget(state: LiveTrackerIndividualState, target: UpdateTarget): Promise<void> {
    if (!target.websocket) {
      throw new Error("WebSocket target missing websocket fields");
    }

    // Find the specific WebSocket for this target using tags
    const allWebSockets = this.state.getWebSockets();
    let targetWebSocket: WebSocket | null = null;

    for (const ws of allWebSockets) {
      const tags = this.state.getTags(ws);
      if (tags.includes(target.id)) {
        targetWebSocket = ws;
        break;
      }
    }

    if (targetWebSocket === null) {
      // WebSocket no longer exists (already closed) - mark for removal
      throw new Error("WebSocket connection not found");
    }

    const data = await this.stateToContractData(state);
    const message = JSON.stringify({
      type: "state",
      data,
      timestamp: new Date().toISOString(),
    });

    try {
      targetWebSocket.send(message);
    } catch (sendError) {
      // Close the failed WebSocket (will trigger webSocketClose handler)
      try {
        targetWebSocket.close(1011, "Send failed");
      } catch {
        // Ignore close errors
      }

      this.logService.info(
        "LiveTracker Individual: Failed to send to WebSocket, closing connection",
        new Map([
          ["targetId", target.id],
          ["error", String(sendError)],
        ]),
      );

      // Throw to mark target for removal in broadcastStateUpdate
      throw sendError;
    }
  }

  /**
   * Broadcast state update to all registered targets with resilient error handling
   */
  private async broadcastStateUpdate(state: LiveTrackerIndividualState): Promise<void> {
    if (state.updateTargets.length === 0) {
      return;
    }

    const tenMinutesAgo = subMinutes(new Date(), 10).toISOString();
    const beforeCleanup = state.updateTargets.length;
    state.updateTargets = state.updateTargets.filter((t) => t.lastFailureAt == null || t.lastFailureAt > tenMinutesAgo);

    const removedCount = beforeCleanup - state.updateTargets.length;
    if (removedCount > 0) {
      this.logService.info(
        "Cleaned up stale targets",
        new Map([
          ["removedCount", removedCount.toString()],
          ["remainingTargets", state.updateTargets.length.toString()],
        ]),
      );
    }

    const updatePromises = state.updateTargets.map(async (target) => {
      try {
        switch (target.type) {
          case "discord": {
            await this.updateDiscordTarget(state, target);
            break;
          }
          case "websocket": {
            await this.updateWebSocketTarget(state, target);
            break;
          }
          default: {
            throw new UnreachableError(target.type);
          }
        }

        target.lastUpdatedAt = new Date().toISOString();
        delete target.lastFailureAt;
        delete target.failureReason;
      } catch (error) {
        const shouldRemove = this.shouldRemoveTarget(target, error);

        if (shouldRemove) {
          this.logService.info(
            "Removing target due to permanent failure",
            new Map([
              ["targetType", target.type],
              ["targetId", target.id],
              ["error", String(error)],
            ]),
          );

          target.markedForRemoval = true;
        } else {
          target.lastFailureAt = new Date().toISOString();
          target.failureReason = String(error);

          this.logService.warn(
            "Transient failure updating target (will retry)",
            new Map([
              ["targetType", target.type],
              ["targetId", target.id],
              ["error", String(error)],
            ]),
          );
        }
      }
    });

    await Promise.allSettled(updatePromises);
    state.updateTargets = state.updateTargets.filter((t) => !(t.markedForRemoval ?? false));

    if (removedCount > 0 || state.updateTargets.length !== beforeCleanup) {
      await this.state.storage.put("trackerState", state);
    }
  }

  private async stateToContractData(state: LiveTrackerIndividualState): Promise<LiveTrackerIndividualStateData> {
    const rawMatches = await this.loadMatchesFromKV(state.matchIds);
    const medalMetadata = await this.getMedalMetadataFromMatches(rawMatches);
    const groups = await this.transformMatchGroupingsToGroups(state);

    return {
      type: "individual",
      gamertag: state.gamertag,
      xuid: state.xuid,
      status: state.status,
      lastUpdateTime: state.lastUpdateTime,
      medalMetadata,
      playersAssociationData: state.playersAssociationData,
      groups,
      rawMatches,
    };
  }

  private async transformMatchGroupingsToGroups(
    state: LiveTrackerIndividualState,
  ): Promise<LiveTrackerIndividualGroup[]> {
    const groups: LiveTrackerIndividualGroup[] = [];
    const groupedMatchIds = new Set<string>();

    // Process each grouping in matchGroupings
    for (const grouping of Object.values(state.matchGroupings)) {
      // Track which matches are in groups
      for (const matchId of grouping.matchIds) {
        groupedMatchIds.add(matchId);
      }

      // NeatQueue series group
      if (grouping.seriesId !== undefined) {
        const seriesData = await this.fetchSeriesDataFromNeatQueueDO(grouping.seriesId);

        if (seriesData !== null) {
          // Convert SeriesData to LiveTrackerNeatQueueSeriesGroup
          const matchSummaries = Array.from(seriesData.discoveredMatches.values());

          // Transform player association data to player array
          const players = Object.values(seriesData.playersAssociationData).map((playerData) => ({
            id: playerData.discordId,
            discordUsername: playerData.discordName,
          }));

          const group: LiveTrackerNeatQueueSeriesGroup = {
            type: "neatqueue-series",
            groupId: grouping.groupId,
            seriesId: seriesData.seriesId,
            players,
            teams: seriesData.teams,
            substitutions: seriesData.substitutions,
            seriesScore: seriesData.seriesScore,
            matchSummaries,
            seriesData: {
              seriesId: seriesData.seriesId,
              teams: seriesData.teams,
              seriesScore: seriesData.seriesScore,
              matchIds: Array.from(seriesData.matchIds),
              startTime: seriesData.startTime,
              lastUpdateTime: seriesData.lastUpdateTime,
            },
          };
          groups.push(group);
        } else {
          // Series data not available, fall back to manual grouping
          const matchSummaries = grouping.matchIds
            .map((matchId) => state.discoveredMatches[matchId])
            .filter((match): match is LiveTrackerMatchSummary => match !== undefined);

          if (matchSummaries.length > 1) {
            const group: LiveTrackerManualMatchGroup = {
              type: "grouped-matches",
              groupId: grouping.groupId,
              label: this.generateGroupLabel(matchSummaries),
              seriesScore: await this.calculateSeriesScore(matchSummaries, state),
              matchSummaries,
            };
            groups.push(group);
          } else if (matchSummaries.length === 1 && matchSummaries[0] !== undefined) {
            const group: LiveTrackerSingleMatchGroup = {
              type: "single-match",
              groupId: grouping.groupId,
              matchSummary: matchSummaries[0],
            };
            groups.push(group);
          }
        }
      }
      // Manual match group (multiple matches, no seriesId)
      else if (grouping.matchIds.length > 1) {
        const matchSummaries = grouping.matchIds
          .map((matchId) => state.discoveredMatches[matchId])
          .filter((match): match is LiveTrackerMatchSummary => match !== undefined);

        const group: LiveTrackerManualMatchGroup = {
          type: "grouped-matches",
          groupId: grouping.groupId,
          label: this.generateGroupLabel(matchSummaries),
          seriesScore: await this.calculateSeriesScore(matchSummaries, state),
          matchSummaries,
        };
        groups.push(group);
      }
      // Single match in grouping
      else if (grouping.matchIds.length === 1) {
        const [firstMatchId] = grouping.matchIds;
        if (firstMatchId !== undefined) {
          const matchSummary = state.discoveredMatches[firstMatchId];
          if (matchSummary !== undefined) {
            const group: LiveTrackerSingleMatchGroup = {
              type: "single-match",
              groupId: grouping.groupId,
              matchSummary,
            };
            groups.push(group);
          }
        }
      }
    }

    // Add ungrouped matches as single match groups
    for (const [matchId, matchSummary] of Object.entries(state.discoveredMatches)) {
      if (!groupedMatchIds.has(matchId)) {
        const group: LiveTrackerSingleMatchGroup = {
          type: "single-match",
          groupId: matchId,
          matchSummary,
        };
        groups.push(group);
      }
    }

    return groups;
  }

  private async calculateSeriesScore(
    matches: readonly LiveTrackerMatchSummary[],
    state: LiveTrackerIndividualState,
  ): Promise<string> {
    const rawMatches = await this.loadMatchesFromKV(state.matchIds);
    const rawMatchesArray = matches
      .map((match) => rawMatches[match.matchId])
      .filter((match): match is MatchStats => match !== undefined);

    return this.haloService.getSeriesScore(rawMatchesArray, "en-US");
  }

  private generateGroupLabel(matches: readonly LiveTrackerMatchSummary[]): string {
    if (matches.length === 0) {
      return "Custom Games";
    }

    // Extract unique player count from first match
    const [firstMatch] = matches;
    if (firstMatch === undefined) {
      return "Custom Games";
    }

    const playerCount = Object.keys(firstMatch.playerXuidToGametag).length;

    // Get date range
    const dates = matches.map((m) => new Date(m.startTime));
    const [firstDate] = dates;
    const lastDate = dates[dates.length - 1];

    // Format date range
    const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
    const firstDateStr = dateFormat.format(firstDate);
    const lastDateStr = dateFormat.format(lastDate);

    const dateRange = firstDateStr === lastDateStr ? firstDateStr : `${firstDateStr}-${lastDateStr}`;

    return `Custom Games • ${dateRange} • ${playerCount.toLocaleString()} players`;
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
