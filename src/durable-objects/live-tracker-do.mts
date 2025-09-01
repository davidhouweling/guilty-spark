import type { LogService } from "../services/log/types.mjs";
import type { DiscordService } from "../services/discord/discord.mjs";
import { installServices } from "../services/install.mjs";
import { LiveTrackerEmbed } from "../embeds/live-tracker-embed.mjs";

// For POC: 10 seconds for testing, production should be 3 minutes
const ALARM_INTERVAL_MS = 10 * 1000; // 10 seconds
// const ALARM_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes (production)

export interface LiveTrackerState {
  userId: string;
  guildId: string;
  channelId: string;
  queueNumber: number;
  isPaused: boolean;
  status: "active" | "paused" | "stopped";
  liveMessageId?: string | undefined;
  startTime: string; // ISO string
  lastUpdateTime: string; // ISO string
  checkCount: number;
  errorCount: number;
}

export class LiveTrackerDO {
  private readonly state: DurableObjectState;
  private readonly logService: LogService;
  private readonly discordService: DiscordService;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    const services = installServices({ env });
    this.logService = services.logService;
    this.discordService = services.discordService;
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
        return; // Don't process alarm if not active
      }

      // For POC: Just log that alarm fired
      this.logService.info(
        `LiveTracker alarm fired for queue ${trackerState.queueNumber.toString()}`,
        new Map([
          ["guildId", trackerState.guildId],
          ["channelId", trackerState.channelId],
          ["queueNumber", trackerState.queueNumber.toString()],
          ["checkCount", trackerState.checkCount.toString()],
        ]),
      );

      // Update state to show we processed an alarm
      trackerState.checkCount += 1;
      const currentTime = new Date();
      trackerState.lastUpdateTime = currentTime.toISOString();
      await this.setState(trackerState);

      // Update Discord message with new embed if we have a message ID
      if (trackerState.liveMessageId != null && trackerState.liveMessageId !== "") {
        try {
          const nextCheckTime = new Date(currentTime.getTime() + ALARM_INTERVAL_MS);
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

      // Schedule next alarm
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
      checkCount: 0,
      errorCount: 0,
    };

    await this.setState(trackerState);

    // If we have an interaction token, create the initial live tracker message
    if (typedBody.interactionToken != null && typedBody.interactionToken !== "") {
      try {
        // First, send a loading message
        const loadingMessage = await this.discordService.updateDeferredReply(typedBody.interactionToken, {
          embeds: [
            {
              title: "🔄 Starting Live Tracker",
              description: "Setting up live tracking for your NeatQueue series...",
              color: 0x007acc, // Blue loading color
            },
          ],
        });

        // Store the message ID immediately
        trackerState.liveMessageId = loadingMessage.id;
        await this.setState(trackerState);

        // Then update with the actual live tracker embed
        const currentTime = new Date();
        const nextCheckTime = new Date(currentTime.getTime() + ALARM_INTERVAL_MS);

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
          },
        );

        // Update the message with the live tracker
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

    // Set first alarm
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

    // Resume alarms
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

    // Cancel any existing alarms
    await this.state.storage.deleteAlarm();

    return Response.json({ success: true, state: trackerState });
  }

  private async handleRefresh(): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    // Only allow refresh for active or paused trackers
    if (trackerState.status === "stopped") {
      return new Response("Cannot refresh stopped tracker", { status: 400 });
    }

    try {
      // Update state to show manual refresh
      trackerState.checkCount += 1;
      const currentTime = new Date();
      trackerState.lastUpdateTime = currentTime.toISOString();
      await this.setState(trackerState);

      // Update Discord message if we have a message ID
      if (trackerState.liveMessageId != null && trackerState.liveMessageId !== "") {
        const nextCheckTime = new Date(currentTime.getTime() + ALARM_INTERVAL_MS);

        // Create embed data based on tracker state
        const embedData = {
          userId: trackerState.userId,
          guildId: trackerState.guildId,
          channelId: trackerState.channelId,
          queueNumber: trackerState.queueNumber,
          status: trackerState.status,
          isPaused: trackerState.isPaused,
          lastUpdated: currentTime,
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
}
