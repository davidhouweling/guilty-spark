import type { APIGuildMember, APIChannel } from "discord-api-types/v10";
import { ChannelType, PermissionFlagsBits } from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import { differenceInMilliseconds, addMinutes } from "date-fns";
import type { LogService } from "../services/log/types.mjs";
import type { DiscordService } from "../services/discord/discord.mjs";
import type { HaloService } from "../services/halo/halo.mjs";
import type { DatabaseService } from "../services/database/database.mjs";
import { installServices as installServicesImpl } from "../services/install.mjs";
import type { LiveTrackerEmbedData, EnrichedMatchData } from "../embeds/live-tracker-embed.mjs";
import { LiveTrackerEmbed } from "../embeds/live-tracker-embed.mjs";
import { EndUserError } from "../base/end-user-error.mjs";
import { DiscordError } from "../services/discord/discord-error.mjs";

// Production: 3 minutes for live tracking (user-facing display)
const DISPLAY_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes shown to users
const EXECUTION_BUFFER_MS = 5 * 1000; // 5 seconds earlier execution for processing time
const ALARM_INTERVAL_MS = DISPLAY_INTERVAL_MS - EXECUTION_BUFFER_MS; // Execute 5 seconds early

// Error handling constants for exponential backoff
const NORMAL_INTERVAL_MINUTES = 3;
const FIRST_ERROR_INTERVAL_MINUTES = 3;
const CONSECUTIVE_ERROR_INTERVAL_MINUTES = 5;
const MAX_BACKOFF_INTERVAL_MINUTES = 10;
const ERROR_THRESHOLD_MINUTES = 10;

// Refresh cooldown constant
const REFRESH_COOLDOWN_MS = 30 * 1000; // 30 seconds

export interface LiveTrackerStartData {
  userId: string;
  guildId: string;
  channelId: string;
  queueNumber: number;
  interactionToken?: string;
  liveMessageId?: string | undefined;
  teams: { name: string; players: APIGuildMember[] }[];
  queueStartTime: string;
}

export interface LiveTrackerState {
  userId: string;
  guildId: string;
  channelId: string;
  queueNumber: number;
  isPaused: boolean;
  status: "active" | "paused" | "stopped";
  liveMessageId?: string | undefined;
  startTime: string;
  lastUpdateTime: string;
  queueStartTime: string;
  checkCount: number;
  teams: {
    name: string;
    players: APIGuildMember[];
  }[];
  substitutions: {
    playerOutId: string;
    playerInId: string;
    teamIndex: number;
    teamName: string;
    timestamp: string;
  }[];
  errorState: {
    consecutiveErrors: number;
    backoffMinutes: number;
    lastSuccessTime: string;
    lastErrorMessage?: string | undefined;
  };
  discoveredMatches: Record<string, EnrichedMatchData>;
  rawMatches: Record<string, MatchStats>;
  lastMessageState: {
    matchCount: number;
    substitutionCount: number;
  };
  channelManagePermissionCache?: boolean;
  lastRefreshAttempt?: string;
}

export class LiveTrackerDO {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private readonly logService: LogService;
  private readonly discordService: DiscordService;
  private readonly haloService: HaloService;
  private readonly databaseService: DatabaseService;

  constructor(state: DurableObjectState, env: Env, installServices = installServicesImpl) {
    this.state = state;
    this.env = env;
    const services = installServices({ env });
    this.logService = services.logService;
    this.discordService = services.discordService;
    this.haloService = services.haloService;
    this.databaseService = services.databaseService;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.split("/").pop();

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
          return await this.handleRefresh();
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
        case undefined: {
          return new Response("Bad Request", { status: 400 });
        }
        default: {
          return new Response("Not Found", { status: 404 });
        }
      }
    } catch (error) {
      this.logService.error("LiveTrackerDO error:", new Map([["error", String(error)]]));
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  async alarm(): Promise<void> {
    try {
      const trackerState = await this.getState();
      if (!trackerState || trackerState.status !== "active" || trackerState.isPaused) {
        return;
      }

      trackerState.lastRefreshAttempt = new Date().toISOString();

      this.logService.info(
        `LiveTracker alarm fired for queue ${trackerState.queueNumber.toString()}`,
        new Map([
          ["guildId", trackerState.guildId],
          ["channelId", trackerState.channelId],
          ["queueNumber", trackerState.queueNumber.toString()],
          ["checkCount", trackerState.checkCount.toString()],
          ["errorCount", trackerState.errorState.consecutiveErrors.toString()],
          ["backoffMinutes", trackerState.errorState.backoffMinutes.toString()],
        ]),
      );

      let enrichedMatches: EnrichedMatchData[] = [];
      const fetchStartTime = Date.now();

      try {
        enrichedMatches = await this.fetchAndMergeSeriesData(trackerState);
        const fetchDurationMs = Date.now() - fetchStartTime;

        this.logService.info(
          `Fetched ${enrichedMatches.length.toString()} total matches for queue ${trackerState.queueNumber.toString()} (took ${fetchDurationMs.toString()}ms)`,
          new Map([
            ["totalMatches", enrichedMatches.length.toString()],
            ["fetchDurationMs", fetchDurationMs.toString()],
            ["queueStartTime", new Date(trackerState.queueStartTime).toISOString()],
            ["currentTime", new Date().toISOString()],
          ]),
        );

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
          await this.state.storage.deleteAlarm();
          await this.state.storage.deleteAll();
          return;
        }
      }

      trackerState.checkCount += 1;
      const currentTime = new Date();
      trackerState.lastUpdateTime = currentTime.toISOString();

      if (trackerState.liveMessageId != null && trackerState.liveMessageId !== "") {
        try {
          const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
          const nextCheckTime = new Date(currentTime.getTime() + nextAlarmInterval + EXECUTION_BUFFER_MS);

          const rawMatchesArray = Object.values(trackerState.rawMatches);
          const seriesScore = this.haloService.getSeriesScore(rawMatchesArray, "en-US");
          const liveTrackerEmbed = new LiveTrackerEmbed(
            { discordService: this.discordService },
            {
              userId: trackerState.userId,
              guildId: trackerState.guildId,
              channelId: trackerState.channelId,
              queueNumber: trackerState.queueNumber,
              status: "active",
              isPaused: false,
              lastUpdated: currentTime,
              nextCheck: nextCheckTime,
              enrichedMatches,
              seriesScore,
              substitutions: trackerState.substitutions,
              errorState: trackerState.errorState,
              lastRefreshAttempt: trackerState.lastRefreshAttempt,
            },
          );

          await this.updateChannelName(trackerState, seriesScore, false);
          await this.updateLiveTrackerMessage(trackerState, liveTrackerEmbed);
        } catch (error) {
          // 10003 = Unknown channel
          if (error instanceof DiscordError && (error.httpStatus === 404 || error.restError.code === 10003)) {
            this.logService.warn(
              "Live tracker channel not found, likely finished",
              new Map([
                ["channelId", trackerState.channelId],
                ["messageId", trackerState.liveMessageId],
              ]),
            );
            await this.state.storage.deleteAlarm();
            await this.state.storage.deleteAll();
            return;
          }

          this.logService.error(
            "Failed to update live tracker message",
            new Map([
              ["error", String(error)],
              ["messageId", trackerState.liveMessageId],
            ]),
          );
          this.handleError(trackerState, `Discord update failed: ${String(error)}`);
        }
      }

      await this.setState(trackerState);

      const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
      await this.state.storage.setAlarm(Date.now() + nextAlarmInterval);
    } catch (error) {
      this.logService.error("LiveTracker alarm error:", new Map([["error", String(error)]]));
    }
  }

  private async handleStart(request: Request): Promise<Response> {
    const body = await request.json();
    const typedBody = body as LiveTrackerStartData;

    const trackerState: LiveTrackerState = {
      userId: typedBody.userId,
      guildId: typedBody.guildId,
      channelId: typedBody.channelId,
      queueNumber: typedBody.queueNumber,
      isPaused: false,
      status: "active",
      liveMessageId: typedBody.liveMessageId,
      startTime: new Date().toISOString(),
      lastUpdateTime: new Date().toISOString(),
      queueStartTime: typedBody.queueStartTime,
      checkCount: 0,
      teams: typedBody.teams,
      substitutions: [],
      discoveredMatches: {},
      rawMatches: {},
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
    };

    await this.setState(trackerState);

    try {
      const loadingMessage = await this.createInitialMessage(typedBody);
      trackerState.liveMessageId = loadingMessage.id;
      await this.setState(trackerState);

      const currentTime = new Date();
      const nextCheckTime = addMinutes(currentTime, 3);

      const enrichedMatches = await this.fetchAndMergeSeriesData(trackerState);
      const rawMatchesArray = Object.values(trackerState.rawMatches);
      const seriesScore = this.haloService.getSeriesScore(rawMatchesArray, "en-US");
      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService: this.discordService },
        {
          userId: typedBody.userId,
          guildId: typedBody.guildId,
          channelId: typedBody.channelId,
          queueNumber: typedBody.queueNumber,
          status: "active",
          isPaused: false,
          lastUpdated: currentTime,
          nextCheck: nextCheckTime,
          enrichedMatches: enrichedMatches,
          seriesScore,
          substitutions: trackerState.substitutions,
          errorState: trackerState.errorState,
          lastRefreshAttempt: trackerState.lastRefreshAttempt,
        },
      );

      await this.updateChannelName(trackerState, seriesScore, true);
      await this.discordService.editMessage(typedBody.channelId, loadingMessage.id, liveTrackerEmbed.toMessageData());

      this.logService.info(
        `Created live tracker message for queue ${trackerState.queueNumber.toString()}`,
        new Map([["messageId", loadingMessage.id]]),
      );
    } catch (error) {
      // 10003 = Unknown channel
      if (error instanceof DiscordError && (error.httpStatus === 404 || error.restError.code === 10003)) {
        this.logService.warn(
          "Live tracker channel not found, likely finished",
          new Map([
            ["channelId", trackerState.channelId],
            ["messageId", trackerState.liveMessageId],
          ]),
        );
        await this.state.storage.deleteAlarm();
        await this.state.storage.deleteAll();
        return Response.json({ success: false, state: trackerState });
      }

      this.logService.error("Failed to create initial live tracker message", new Map([["error", String(error)]]));
    }

    await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    return Response.json({ success: true, state: trackerState });
  }

  private async createInitialMessage(startData: LiveTrackerStartData): Promise<{ id: string }> {
    const loadingEmbedData = {
      embeds: [
        {
          title: "🔄 Starting Live Tracker",
          description: "Setting up live tracking for your NeatQueue series...",
          color: 0x007acc,
        },
      ],
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
        const enrichedMatches = await this.fetchAndMergeSeriesData(trackerState);
        const rawMatchesArray = Object.values(trackerState.rawMatches);
        const seriesScore = this.haloService.getSeriesScore(rawMatchesArray, "en-US");
        const embedData: LiveTrackerEmbedData = {
          userId: trackerState.userId,
          guildId: trackerState.guildId,
          channelId: trackerState.channelId,
          queueNumber: trackerState.queueNumber,
          status: trackerState.status,
          isPaused: trackerState.isPaused,
          lastUpdated: currentTime,
          nextCheck: undefined,
          enrichedMatches,
          seriesScore,
          substitutions: trackerState.substitutions,
          errorState: trackerState.errorState,
        };

        return Response.json({ success: true, state: trackerState, embedData });
      } catch (error) {
        this.logService.warn(
          "Failed to enrich pause response, returning basic state",
          new Map([["error", String(error)]]),
        );
      }
    }

    return Response.json({ success: true, state: trackerState });
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

    await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);

    if (Object.keys(trackerState.discoveredMatches).length > 0) {
      try {
        const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
        const nextCheckTime = new Date(currentTime.getTime() + nextAlarmInterval + EXECUTION_BUFFER_MS);
        const enrichedMatches = await this.fetchAndMergeSeriesData(trackerState);
        const rawMatchesArray = Object.values(trackerState.rawMatches);
        const seriesScore = this.haloService.getSeriesScore(rawMatchesArray, "en-US");
        const embedData: LiveTrackerEmbedData = {
          userId: trackerState.userId,
          guildId: trackerState.guildId,
          channelId: trackerState.channelId,
          queueNumber: trackerState.queueNumber,
          status: trackerState.status,
          isPaused: trackerState.isPaused,
          lastUpdated: currentTime,
          nextCheck: nextCheckTime,
          enrichedMatches,
          seriesScore,
          substitutions: trackerState.substitutions,
          errorState: trackerState.errorState,
        };

        return Response.json({ success: true, state: trackerState, embedData });
      } catch (error) {
        this.logService.warn(
          "Failed to enrich resume response, returning basic state",
          new Map([["error", String(error)]]),
        );
      }
    }

    return Response.json({ success: true, state: trackerState });
  }

  private async handleStop(): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    let embedData: LiveTrackerEmbedData | undefined;
    if (Object.keys(trackerState.discoveredMatches).length > 0) {
      try {
        const currentTime = new Date();
        const enrichedMatches = await this.fetchAndMergeSeriesData(trackerState);
        const rawMatchesArray = Object.values(trackerState.rawMatches);
        const seriesScore = this.haloService.getSeriesScore(rawMatchesArray, "en-US");
        embedData = {
          userId: trackerState.userId,
          guildId: trackerState.guildId,
          channelId: trackerState.channelId,
          queueNumber: trackerState.queueNumber,
          status: "stopped",
          isPaused: false,
          lastUpdated: currentTime,
          nextCheck: undefined,
          enrichedMatches,
          seriesScore,
          substitutions: trackerState.substitutions,
          errorState: trackerState.errorState,
        };
      } catch (error) {
        this.logService.warn(
          "Failed to enrich stop response, returning basic state",
          new Map([["error", String(error)]]),
        );
      }
    }

    await this.resetChannelName(trackerState);
    await this.state.storage.deleteAlarm();
    await this.state.storage.deleteAll();

    return Response.json({ success: true, state: trackerState, embedData });
  }

  private isInCooldown(trackerState: LiveTrackerState): { inCooldown: boolean; remainingMs: number } {
    if (trackerState.lastRefreshAttempt == null || trackerState.lastRefreshAttempt === "") {
      return { inCooldown: false, remainingMs: 0 };
    }

    const lastAttemptTime = new Date(trackerState.lastRefreshAttempt);
    const currentTime = new Date();
    const timeSinceLastAttempt = differenceInMilliseconds(currentTime, lastAttemptTime);
    const remainingMs = REFRESH_COOLDOWN_MS - timeSinceLastAttempt;

    return {
      inCooldown: remainingMs > 0,
      remainingMs: Math.max(0, remainingMs),
    };
  }

  private async handleRefresh(): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    if (trackerState.status === "stopped") {
      return new Response("Cannot refresh stopped tracker", { status: 400 });
    }

    const cooldownStatus = this.isInCooldown(trackerState);
    if (cooldownStatus.inCooldown) {
      const remainingSeconds = Math.ceil(cooldownStatus.remainingMs / 1000);
      return new Response(
        JSON.stringify({
          success: false,
          error: "cooldown",
          message: `Please wait ${remainingSeconds.toString()} seconds before refreshing again`,
          remainingSeconds,
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      const currentTime = new Date();
      trackerState.lastRefreshAttempt = currentTime.toISOString();
      trackerState.checkCount += 1;
      trackerState.lastUpdateTime = currentTime.toISOString();

      if (trackerState.liveMessageId != null && trackerState.liveMessageId !== "") {
        const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
        const nextCheckTime = new Date(currentTime.getTime() + nextAlarmInterval + EXECUTION_BUFFER_MS);

        const enrichedMatches = await this.fetchAndMergeSeriesData(trackerState);
        const rawMatchesArray = Object.values(trackerState.rawMatches);
        const seriesScore = this.haloService.getSeriesScore(rawMatchesArray, "en-US");
        const embedData: LiveTrackerEmbedData = {
          userId: trackerState.userId,
          guildId: trackerState.guildId,
          channelId: trackerState.channelId,
          queueNumber: trackerState.queueNumber,
          status: trackerState.status,
          isPaused: trackerState.isPaused,
          lastUpdated: currentTime,
          nextCheck: trackerState.status === "active" && !trackerState.isPaused ? nextCheckTime : undefined,
          enrichedMatches: enrichedMatches,
          seriesScore,
          substitutions: trackerState.substitutions,
          errorState: trackerState.errorState,
          lastRefreshAttempt: trackerState.lastRefreshAttempt,
        };

        const liveTrackerEmbed = new LiveTrackerEmbed({ discordService: this.discordService }, embedData);

        await this.updateChannelName(trackerState, seriesScore, false);
        await this.updateLiveTrackerMessage(trackerState, liveTrackerEmbed);
      }

      await this.setState(trackerState);

      return Response.json({ success: true, state: trackerState });
    } catch (error) {
      // 10003 = Unknown channel
      if (error instanceof DiscordError && (error.httpStatus === 404 || error.restError.code === 10003)) {
        this.logService.warn(
          "Live tracker channel not found, likely finished",
          new Map([
            ["channelId", trackerState.channelId],
            ["messageId", trackerState.liveMessageId],
          ]),
        );
        await this.state.storage.deleteAlarm();
        await this.state.storage.deleteAll();
        return Response.json({ success: false, state: trackerState });
      }

      this.logService.error("Failed to refresh live tracker", new Map([["error", String(error)]]));
      this.handleError(trackerState, `Refresh failed: ${String(error)}`);
      await this.setState(trackerState);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  private async handleSubstitution(request: Request): Promise<Response> {
    const body = await request.json();
    const { playerOutId, playerInId } = body as { playerOutId: string; playerInId: string };

    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    if (trackerState.status === "stopped") {
      return new Response("Cannot process substitution for stopped tracker", { status: 400 });
    }

    try {
      let teamIndex = -1;
      let playerIndex = -1;

      for (const [tIndex, team] of trackerState.teams.entries()) {
        const pIndex = team.players.findIndex((player) => player.user.id === playerOutId);
        if (pIndex !== -1) {
          teamIndex = tIndex;
          playerIndex = pIndex;
          break;
        }
      }

      if (teamIndex === -1 || playerIndex === -1) {
        this.logService.warn(
          `Substitution player not found in teams`,
          new Map([
            ["playerOutId", playerOutId],
            ["playerInId", playerInId],
            ["queueNumber", trackerState.queueNumber.toString()],
          ]),
        );
        return new Response("Player not found in teams", { status: 400 });
      }

      const newPlayerUsers = await this.discordService.getUsers(trackerState.guildId, [playerInId]);
      const [newPlayerMember] = newPlayerUsers;
      if (!newPlayerMember) {
        return new Response("New player not found", { status: 400 });
      }

      const targetTeam = trackerState.teams[teamIndex];
      if (!targetTeam) {
        return new Response("Team not found", { status: 400 });
      }
      targetTeam.players[playerIndex] = newPlayerMember;

      trackerState.substitutions.push({
        playerOutId,
        playerInId,
        teamIndex,
        teamName: targetTeam.name,
        timestamp: new Date().toISOString(),
      });

      await this.setState(trackerState);

      this.logService.info(
        `Processed substitution for queue ${trackerState.queueNumber.toString()}`,
        new Map([
          ["playerOutId", playerOutId],
          ["playerInId", playerInId],
          ["teamIndex", teamIndex.toString()],
          ["teamName", targetTeam.name],
        ]),
      );

      return Response.json({ success: true, substitution: { playerOutId, playerInId, teamIndex } });
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

    return Response.json({ state: trackerState });
  }

  private async handleRepost(request: Request): Promise<Response> {
    const body = await request.json();
    const { newMessageId } = body as { newMessageId: string };

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
      `Updated live message ID for queue ${trackerState.queueNumber.toString()}`,
      new Map([
        ["oldMessageId", oldMessageId ?? "none"],
        ["newMessageId", newMessageId],
        ["queueNumber", trackerState.queueNumber.toString()],
      ]),
    );

    return Response.json({ success: true, oldMessageId: oldMessageId ?? "none", newMessageId });
  }

  private async getState(): Promise<LiveTrackerState | null> {
    const state = await this.state.storage.get<LiveTrackerState>("trackerState");
    return state ?? null;
  }

  private async setState(state: LiveTrackerState): Promise<void> {
    await this.state.storage.put("trackerState", state);
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

  private async fetchAndMergeSeriesData(trackerState: LiveTrackerState): Promise<EnrichedMatchData[]> {
    try {
      const teams = trackerState.teams.map((team) =>
        team.players.map((player) => ({
          id: player.user.id,
          username: player.user.username,
          globalName: player.user.global_name ?? null,
          guildNickname: player.nick ?? null,
        })),
      );

      if (trackerState.substitutions.length > 0) {
        const substitutedOutPlayerIds = trackerState.substitutions.map((sub) => sub.playerOutId);
        const substitutedOutUsers = await this.discordService.getUsers(trackerState.guildId, substitutedOutPlayerIds);

        const extendedTeams = teams.map((team, teamIndex) => {
          const teamPlayers = [...team];

          for (const substitution of trackerState.substitutions) {
            if (substitution.teamIndex === teamIndex) {
              const substitutedOutUser = substitutedOutUsers.find((user) => user.user.id === substitution.playerOutId);
              if (substitutedOutUser) {
                teamPlayers.push({
                  id: substitutedOutUser.user.id,
                  username: substitutedOutUser.user.username,
                  globalName: substitutedOutUser.user.global_name ?? null,
                  guildNickname: substitutedOutUser.nick ?? null,
                });
              }
            }
          }

          return teamPlayers;
        });

        const startDateTime = new Date(trackerState.queueStartTime);
        const endDateTime = new Date();

        const matches = await this.haloService.getSeriesFromDiscordQueue(
          {
            teams: extendedTeams,
            startDateTime,
            endDateTime,
          },
          true,
        );

        await this.enrichAndMergeMatches(trackerState, matches);
      } else {
        const startDateTime = new Date(trackerState.queueStartTime);
        const endDateTime = new Date();

        const matches = await this.haloService.getSeriesFromDiscordQueue(
          {
            teams,
            startDateTime,
            endDateTime,
          },
          true,
        );

        await this.enrichAndMergeMatches(trackerState, matches);
      }

      return Object.values(trackerState.discoveredMatches);
    } catch (error) {
      if (error instanceof EndUserError && error.message === "No matches found for the series") {
        return Object.values(trackerState.discoveredMatches);
      }
      throw error;
    }
  }

  private async enrichAndMergeMatches(trackerState: LiveTrackerState, matches: MatchStats[]): Promise<void> {
    for (const match of matches) {
      if (trackerState.discoveredMatches[match.MatchId] != null) {
        continue;
      }

      trackerState.rawMatches[match.MatchId] = match;

      let gameTypeAndMap = "Unknown Map and mode";
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
      const gameScore = this.haloService.getMatchScore(match, "en-US");

      const enrichedMatch: EnrichedMatchData = {
        matchId: match.MatchId,
        gameTypeAndMap,
        duration,
        gameScore,
        endTime: new Date(match.MatchInfo.EndTime),
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
    if (this.hasNewMatchesOrSubstitutions(trackerState)) {
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
        `Created new live tracker message for queue ${trackerState.queueNumber.toString()} (new matches/substitutions detected)`,
        new Map([
          ["newMessageId", newMessage.id],
          ["matchCount", Object.keys(trackerState.discoveredMatches).length.toString()],
          ["substitutionCount", trackerState.substitutions.length.toString()],
        ]),
      );
    } else if (trackerState.liveMessageId != null && trackerState.liveMessageId !== "") {
      await this.discordService.editMessage(
        trackerState.channelId,
        trackerState.liveMessageId,
        liveTrackerEmbed.toMessageData(),
      );

      this.logService.info(
        `Updated live tracker message for queue ${trackerState.queueNumber.toString()}`,
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
          "Bot lacks ManageChannels permission, disabling channel name updates",
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
        "Failed to check permissions for channel name updates",
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
          `Updated channel name for queue ${trackerState.queueNumber.toString()}`,
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
          "Failed to update channel name due to insufficient permissions",
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
        "Failed to update channel name",
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
          `Reset channel name for queue ${trackerState.queueNumber.toString()}`,
          new Map([
            ["oldName", name],
            ["newName", baseChannelName],
          ]),
        );
      }
    } catch (error) {
      this.logService.warn(
        "Failed to reset channel name",
        new Map([
          ["channelId", trackerState.channelId],
          ["error", String(error)],
        ]),
      );
    }
  }
}
