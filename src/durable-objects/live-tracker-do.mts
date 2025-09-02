import type { APIGuildMember } from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import type { LogService } from "../services/log/types.mjs";
import type { DiscordService } from "../services/discord/discord.mjs";
import type { HaloService } from "../services/halo/halo.mjs";
import { installServices } from "../services/install.mjs";
import { LiveTrackerEmbed, type EnrichedMatchData } from "../embeds/live-tracker-embed.mjs";

// Production: 3 minutes for live tracking (user-facing display)
const DISPLAY_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes shown to users
const EXECUTION_BUFFER_MS = 5 * 1000; // 5 seconds earlier execution for processing time
const ALARM_INTERVAL_MS = DISPLAY_INTERVAL_MS - EXECUTION_BUFFER_MS; // Execute 5 seconds early
// const ALARM_INTERVAL_MS = 10 * 1000; // 10 seconds (POC testing)

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
  errorCount: number;
  teams: {
    name: string;
    players: APIGuildMember[];
  }[];
  seriesData: MatchStats[];
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
        ]),
      );

      let newMatches: MatchStats[] = [];
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

        newMatches = await this.haloService.getSeriesFromDiscordQueue(
          {
            teams,
            startDateTime,
            endDateTime,
          },
          true,
        );

        trackerState.seriesData = [...trackerState.seriesData, ...newMatches];

        this.logService.info(
          `Fetched ${newMatches.length.toString()} new matches for queue ${trackerState.queueNumber.toString()}. Total: ${trackerState.seriesData.length.toString()}`,
          new Map([
            ["newMatches", newMatches.length.toString()],
            ["totalMatches", trackerState.seriesData.length.toString()],
            ["startTime", startDateTime.toISOString()],
            ["endTime", endDateTime.toISOString()],
          ]),
        );
      } catch (error) {
        this.logService.warn("Failed to fetch series data, using existing data", new Map([["error", String(error)]]));
        trackerState.errorCount += 1;
      }

      trackerState.checkCount += 1;
      const currentTime = new Date();
      trackerState.lastUpdateTime = currentTime.toISOString();
      await this.setState(trackerState);

      if (trackerState.liveMessageId != null && trackerState.liveMessageId !== "") {
        try {
          const nextCheckTime = new Date(currentTime.getTime() + DISPLAY_INTERVAL_MS);
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
          trackerState.errorCount += 1;
          await this.setState(trackerState);
        }
      }

      await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    } catch (error) {
      this.logService.error("LiveTracker alarm error:", new Map([["error", String(error)]]));
    }
  }

  private async handleStart(request: Request): Promise<Response> {
    const body = await request.json();
    const typedBody = body as {
      userId: string;
      guildId: string;
      channelId: string;
      queueNumber: number;
      interactionToken?: string;
      liveMessageId?: string | undefined;
      teams: { name: string; players: APIGuildMember[] }[];
      queueStartTime: string;
    };

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
      errorCount: 0,
      teams: typedBody.teams,
      seriesData: [],
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
        const nextCheckTime = new Date(currentTime.getTime() + DISPLAY_INTERVAL_MS);

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
      trackerState.errorCount += 1;
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
