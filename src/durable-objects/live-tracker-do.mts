import type { APIGuildMember } from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import type { LogService } from "../services/log/types.mjs";
import type { DiscordService } from "../services/discord/discord.mjs";
import type { HaloService } from "../services/halo/halo.mjs";
import { installServices } from "../services/install.mjs";
import { LiveTrackerEmbed, type EnrichedMatchData } from "../embeds/live-tracker-embed.mjs";
import { EndUserError } from "../base/end-user-error.mjs";

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
  seriesData: MatchStats[];
  // Enhanced error handling for exponential backoff
  errorState: {
    consecutiveErrors: number;
    backoffMinutes: number;
    lastSuccessTime: string;
    lastErrorMessage?: string | undefined;
  };
  // Performance metrics for Phase 4
  metrics: {
    totalChecks: number;
    totalMatches: number;
    totalErrors: number;
    averageCheckDurationMs?: number;
    lastCheckDurationMs?: number;
  };
}

export class LiveTrackerDO {
  private readonly state: DurableObjectState;
  private readonly logService: LogService;
  private readonly discordService: DiscordService;
  private readonly haloService: HaloService;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    const services = installServices({ env });
    this.logService = services.logService;
    this.discordService = services.discordService;
    this.haloService = services.haloService;
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
        case "status": {
          return await this.handleStatus();
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
    const alarmStartTime = Date.now();

    try {
      const trackerState = await this.getState();
      if (!trackerState || trackerState.status !== "active" || trackerState.isPaused) {
        return;
      }

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

      let newMatches: MatchStats[] = [];
      const fetchStartTime = Date.now();

      try {
        const teams = trackerState.teams.map((team) =>
          team.players.map((player) => ({
            id: player.user.id,
            username: player.user.username,
            globalName: player.user.global_name ?? null,
            guildNickname: player.nick ?? null,
          })),
        );
        const startDateTime = new Date(trackerState.lastUpdateTime);
        const endDateTime = new Date();

        try {
          newMatches = await this.haloService.getSeriesFromDiscordQueue(
            {
              teams,
              startDateTime,
              endDateTime,
            },
            true,
          );
        } catch (error) {
          if (error instanceof EndUserError && error.message === "No matches found for the series") {
            this.logService.info(
              "No new matches found for time window",
              new Map([
                ["startDateTime", startDateTime.toISOString()],
                ["endDateTime", endDateTime.toISOString()],
              ]),
            );
          } else {
            throw error;
          }
        }

        trackerState.seriesData = [...trackerState.seriesData, ...newMatches];

        // Update metrics on success
        trackerState.metrics.totalMatches += newMatches.length;
        const fetchDurationMs = Date.now() - fetchStartTime;

        this.logService.info(
          `Fetched ${newMatches.length.toString()} new matches for queue ${trackerState.queueNumber.toString()}. Total: ${trackerState.seriesData.length.toString()} (took ${fetchDurationMs.toString()}ms)`,
          new Map([
            ["newMatches", newMatches.length.toString()],
            ["totalMatches", trackerState.seriesData.length.toString()],
            ["fetchDurationMs", fetchDurationMs.toString()],
            ["startTime", startDateTime.toISOString()],
            ["endTime", endDateTime.toISOString()],
          ]),
        );

        // Success: reset error state
        this.handleSuccess(trackerState);
      } catch (error) {
        this.logService.warn("Failed to fetch series data, using existing data", new Map([["error", String(error)]]));
        trackerState.metrics.totalErrors += 1;
        this.handleError(trackerState, String(error));

        // Check if we should stop due to persistent errors
        if (this.shouldStopDueToErrors(trackerState)) {
          this.logService.error(
            `Stopping live tracker due to persistent errors (${trackerState.errorState.consecutiveErrors.toString()} consecutive errors)`,
            new Map([
              ["queueNumber", trackerState.queueNumber.toString()],
              ["lastError", trackerState.errorState.lastErrorMessage ?? "unknown"],
            ]),
          );
          trackerState.status = "stopped";
          await this.setState(trackerState);
          await this.state.storage.deleteAlarm();
          return;
        }
      }

      trackerState.checkCount += 1;
      const currentTime = new Date();
      trackerState.lastUpdateTime = currentTime.toISOString();

      // Update performance metrics
      trackerState.metrics.totalChecks += 1;
      const totalAlarmDurationMs = Date.now() - alarmStartTime;
      trackerState.metrics.lastCheckDurationMs = totalAlarmDurationMs;

      // Calculate rolling average check duration
      if (trackerState.metrics.averageCheckDurationMs != null) {
        trackerState.metrics.averageCheckDurationMs =
          (trackerState.metrics.averageCheckDurationMs + totalAlarmDurationMs) / 2;
      } else {
        trackerState.metrics.averageCheckDurationMs = totalAlarmDurationMs;
      }

      await this.setState(trackerState);

      if (trackerState.liveMessageId != null && trackerState.liveMessageId !== "") {
        try {
          // Calculate next check time based on error state
          const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
          const nextCheckTime = new Date(currentTime.getTime() + nextAlarmInterval + EXECUTION_BUFFER_MS);

          const enrichedMatches = await this.createEnrichedMatchData(trackerState.seriesData);
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
              enrichedMatches: enrichedMatches,
              teams: trackerState.teams,
              errorState: trackerState.errorState, // Pass error state to embed
            },
          );

          await this.discordService.editMessage(
            trackerState.channelId,
            trackerState.liveMessageId,
            liveTrackerEmbed.toMessageData(),
          );

          this.logService.info(
            `Updated live tracker message for queue ${trackerState.queueNumber.toString()}`,
            new Map([["messageId", trackerState.liveMessageId]]),
          );
        } catch (error) {
          this.logService.error(
            "Failed to update live tracker message",
            new Map([
              ["error", String(error)],
              ["messageId", trackerState.liveMessageId],
            ]),
          );
          this.handleError(trackerState, `Discord update failed: ${String(error)}`);
          await this.setState(trackerState);
        }
      }

      // Use dynamic interval based on error state
      const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
      await this.state.storage.setAlarm(Date.now() + nextAlarmInterval);

      // Log performance metrics periodically
      if (trackerState.checkCount % 10 === 0) {
        this.logService.info(
          `Live Tracker Performance Metrics (Queue ${trackerState.queueNumber.toString()})`,
          new Map([
            ["totalChecks", trackerState.metrics.totalChecks.toString()],
            ["totalMatches", trackerState.metrics.totalMatches.toString()],
            ["totalErrors", trackerState.metrics.totalErrors.toString()],
            ["avgCheckDurationMs", trackerState.metrics.averageCheckDurationMs.toString()],
            ["lastCheckDurationMs", trackerState.metrics.lastCheckDurationMs.toString()],
            [
              "errorRate",
              ((trackerState.metrics.totalErrors / trackerState.metrics.totalChecks) * 100).toFixed(1) + "%",
            ],
          ]),
        );
      }
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
      seriesData: [],
      errorState: {
        consecutiveErrors: 0,
        backoffMinutes: NORMAL_INTERVAL_MINUTES,
        lastSuccessTime: new Date().toISOString(),
        lastErrorMessage: undefined,
      },
      metrics: {
        totalChecks: 0,
        totalMatches: 0,
        totalErrors: 0,
      },
    };

    await this.setState(trackerState);

    if (typedBody.interactionToken != null && typedBody.interactionToken !== "") {
      try {
        const loadingMessage = await this.discordService.updateDeferredReply(typedBody.interactionToken, {
          embeds: [
            {
              title: "🔄 Starting Live Tracker",
              description: "Setting up live tracking for your NeatQueue series...",
              color: 0x007acc, // Blue loading color
            },
          ],
        });

        trackerState.liveMessageId = loadingMessage.id;
        await this.setState(trackerState);

        const currentTime = new Date();
        const nextCheckTime = new Date(currentTime.getTime() + DISPLAY_INTERVAL_MS);

        const enrichedMatches = await this.createEnrichedMatchData(trackerState.seriesData);
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
            teams: trackerState.teams,
            errorState: trackerState.errorState,
          },
        );

        await this.discordService.editMessage(typedBody.channelId, loadingMessage.id, liveTrackerEmbed.toMessageData());

        this.logService.info(
          `Created live tracker message for queue ${trackerState.queueNumber.toString()}`,
          new Map([["messageId", loadingMessage.id]]),
        );
      } catch (error) {
        this.logService.error("Failed to create initial live tracker message", new Map([["error", String(error)]]));
        // Continue anyway - the DO is still started, just without the message
      }
    }

    await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    return Response.json({ success: true, state: trackerState });
  }

  private async handlePause(): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    trackerState.isPaused = true;
    trackerState.status = "paused";
    trackerState.lastUpdateTime = new Date().toISOString();
    await this.setState(trackerState);

    return Response.json({ success: true, state: trackerState });
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

    await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);

    return Response.json({ success: true, state: trackerState });
  }

  private async handleStop(): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    trackerState.status = "stopped";
    trackerState.lastUpdateTime = new Date().toISOString();
    await this.setState(trackerState);

    await this.state.storage.deleteAlarm();

    return Response.json({ success: true, state: trackerState });
  }

  private async handleRefresh(): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    if (trackerState.status === "stopped") {
      return new Response("Cannot refresh stopped tracker", { status: 400 });
    }

    try {
      trackerState.checkCount += 1;
      const currentTime = new Date();
      trackerState.lastUpdateTime = currentTime.toISOString();
      await this.setState(trackerState);

      if (trackerState.liveMessageId != null && trackerState.liveMessageId !== "") {
        // Calculate next check time based on error state for refresh too
        const nextAlarmInterval = this.getNextAlarmInterval(trackerState);
        const nextCheckTime = new Date(currentTime.getTime() + nextAlarmInterval + EXECUTION_BUFFER_MS);

        const enrichedMatches = await this.createEnrichedMatchData(trackerState.seriesData);
        const embedData = {
          userId: trackerState.userId,
          guildId: trackerState.guildId,
          channelId: trackerState.channelId,
          queueNumber: trackerState.queueNumber,
          status: trackerState.status,
          isPaused: trackerState.isPaused,
          lastUpdated: currentTime,
          teams: trackerState.teams,
          enrichedMatches: enrichedMatches,
          errorState: trackerState.errorState,
          ...(trackerState.status === "active" && !trackerState.isPaused && { nextCheck: nextCheckTime }),
        };

        const liveTrackerEmbed = new LiveTrackerEmbed({ discordService: this.discordService }, embedData);

        await this.discordService.editMessage(
          trackerState.channelId,
          trackerState.liveMessageId,
          liveTrackerEmbed.toMessageData(),
        );

        this.logService.info(
          `Manually refreshed live tracker message for queue ${trackerState.queueNumber.toString()}`,
          new Map([
            ["messageId", trackerState.liveMessageId],
            ["checkCount", trackerState.checkCount.toString()],
          ]),
        );
      }

      return Response.json({ success: true, state: trackerState });
    } catch (error) {
      this.logService.error("Failed to refresh live tracker", new Map([["error", String(error)]]));
      this.handleError(trackerState, `Refresh failed: ${String(error)}`);
      await this.setState(trackerState);
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
      // First error: continue with 3 minutes (normal interval)
      trackerState.errorState.backoffMinutes = FIRST_ERROR_INTERVAL_MINUTES;
    } else {
      // Consecutive errors: exponential backoff 5 → 10 minutes
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

  /**
   * Get next alarm interval based on error state
   */
  private getNextAlarmInterval(trackerState: LiveTrackerState): number {
    if (trackerState.errorState.consecutiveErrors === 0) {
      return ALARM_INTERVAL_MS;
    }

    // Convert backoff minutes to milliseconds, subtract execution buffer
    return trackerState.errorState.backoffMinutes * 60 * 1000 - EXECUTION_BUFFER_MS;
  }

  private async createEnrichedMatchData(matches: MatchStats[]): Promise<EnrichedMatchData[]> {
    const enrichedMatches: EnrichedMatchData[] = [];

    for (const match of matches) {
      try {
        const gameTypeAndMap = await this.haloService.getGameTypeAndMap(match.MatchInfo);
        const gameDuration = this.haloService.getReadableDuration(match.MatchInfo.Duration, "en-US");
        const teamScores = match.Teams.map((team) => team.Stats.CoreStats.Score);
        enrichedMatches.push({
          matchId: match.MatchId,
          gameTypeAndMap,
          gameDuration,
          teamScores,
        });
      } catch (error) {
        this.logService.warn(
          "Failed to enrich match data, using fallback",
          new Map([
            ["matchId", match.MatchId],
            ["error", String(error)],
          ]),
        );

        const teamScores = match.Teams.map((team) => team.Stats.CoreStats.Score);

        enrichedMatches.push({
          matchId: match.MatchId,
          gameTypeAndMap: "Unknown Map - Unknown Mode",
          gameDuration: "Unknown",
          teamScores,
        });
      }
    }

    return enrichedMatches;
  }
}
