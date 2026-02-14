import type { APIGuildMember, APIMessageComponentButtonInteraction, APIEmbed } from "discord-api-types/v10";
import type { LiveTrackerDO } from "../../durable-objects/live-tracker-do.mjs";
import type {
  LiveTrackerStartRequest,
  LiveTrackerStartResponse,
  LiveTrackerPauseResponse,
  LiveTrackerResumeResponse,
  LiveTrackerStopResponse,
  LiveTrackerRefreshResponse,
  LiveTrackerSubstitutionRequest,
  LiveTrackerSubstitutionResponse,
  LiveTrackerStatusResponse,
  LiveTrackerRepostRequest,
  LiveTrackerRepostResponse,
  LiveTrackerState,
  LiveTrackerRefreshCooldownErrorResponse,
  LiveTrackerRefreshRequest,
} from "../../durable-objects/types.mjs";
import type { LogService } from "../log/types.mjs";
import type { DiscordService } from "../discord/discord.mjs";
import { LiveTrackerEmbed } from "../../embeds/live-tracker-embed.mjs";
import type { LiveTrackerEmbedData } from "../../live-tracker/types.mjs";

export interface LiveTrackerContext {
  userId: string;
  guildId: string;
  channelId: string;
  queueNumber: number;
}

export interface LiveTrackerServiceOpts {
  env: Env;
  logService: LogService;
  discordService: DiscordService;
}

interface StartTrackerOpts {
  userId: string;
  guildId: string;
  channelId: string;
  queueNumber: number;
  interactionToken?: string;
  players: Record<string, APIGuildMember>;
  teams: { name: string; playerIds: string[] }[];
  queueStartTime: string;
}

interface RecordSubstitutionOpts {
  context: LiveTrackerContext;
  playerOutId: string;
  playerInId: string;
}

interface RepostTrackerOpts {
  context: LiveTrackerContext;
  newMessageId: string;
}

interface DiscoverActiveTrackerOpts {
  guildId: string;
  channelId: string;
}

interface SafeStopIfActiveOpts {
  guildId: string;
  channelId: string;
  queueNumber: number;
}

interface SafeRecordSubstitutionOpts {
  guildId: string;
  channelId: string;
  queueNumber: number;
  playerOutId: string;
  playerInId: string;
}

interface HandleRefreshCooldownOpts {
  interaction: APIMessageComponentButtonInteraction;
  response: LiveTrackerRefreshCooldownErrorResponse;
}

interface CreateLiveTrackerEmbedFromResultOpts {
  context: LiveTrackerContext;
  embedData: LiveTrackerEmbedData | undefined;
  defaultStatus: "active" | "paused";
  additionalTime?: Date;
}

export class LiveTrackerService {
  private readonly env: Env;
  private readonly logService: LogService;
  private readonly discordService: DiscordService;

  constructor({ env, logService, discordService }: LiveTrackerServiceOpts) {
    this.env = env;
    this.logService = logService;
    this.discordService = discordService;
  }

  /**
   * Starts a new live tracker for a NeatQueue series
   */
  async startTracker({
    userId,
    guildId,
    channelId,
    queueNumber,
    players,
    queueStartTime,
    teams,
    interactionToken,
  }: StartTrackerOpts): Promise<LiveTrackerStartResponse> {
    const context: LiveTrackerContext = {
      userId,
      guildId,
      channelId,
      queueNumber,
    };

    this.logService.info("LiveTrackerService: Starting live tracker", this.createLogParams(context));

    const doStub = this.getDurableObjectStub(context);
    const startData: LiveTrackerStartRequest = {
      userId,
      guildId,
      channelId,
      queueNumber,
      players,
      teams,
      queueStartTime,
    };

    if (interactionToken != null && interactionToken !== "") {
      startData.interactionToken = interactionToken;
    }

    const response = await doStub.fetch("http://do/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(startData),
    });

    if (!response.ok) {
      const error = `Failed to start live tracker: ${response.status.toString()}`;
      this.logService.error(error, this.createLogParams(context));
      throw new Error(error);
    }

    const result = await response.json<LiveTrackerStartResponse>();
    this.logService.info("LiveTrackerService: Live tracker started successfully", this.createLogParams(context));
    return result;
  }

  /**
   * Pauses an active live tracker
   */
  async pauseTracker(context: LiveTrackerContext): Promise<LiveTrackerPauseResponse> {
    this.logService.info("LiveTrackerService: Pausing live tracker", this.createLogParams(context));

    const doStub = this.getDurableObjectStub(context);
    const response = await doStub.fetch("http://do/pause", {
      method: "POST",
    });

    if (!response.ok) {
      const error = `Failed to pause live tracker: ${response.status.toString()}`;
      this.logService.error(error, this.createLogParams(context));
      throw new Error(error);
    }

    const result = await response.json<LiveTrackerPauseResponse>();
    this.logService.info("LiveTrackerService: Live tracker paused successfully", this.createLogParams(context));
    return result;
  }

  /**
   * Resumes a paused live tracker
   */
  async resumeTracker(context: LiveTrackerContext): Promise<LiveTrackerResumeResponse> {
    this.logService.info("LiveTrackerService: Resuming live tracker", this.createLogParams(context));

    const doStub = this.getDurableObjectStub(context);
    const response = await doStub.fetch("http://do/resume", {
      method: "POST",
    });

    if (!response.ok) {
      const error = `Failed to resume live tracker: ${response.status.toString()}`;
      this.logService.error(error, this.createLogParams(context));
      throw new Error(error);
    }

    const result = await response.json<LiveTrackerResumeResponse>();
    this.logService.info("LiveTrackerService: Live tracker resumed successfully", this.createLogParams(context));
    return result;
  }

  /**
   * Stops an active live tracker
   */
  async stopTracker(context: LiveTrackerContext): Promise<LiveTrackerStopResponse> {
    this.logService.info("LiveTrackerService: Stopping live tracker", this.createLogParams(context));

    const doStub = this.getDurableObjectStub(context);
    const response = await doStub.fetch("http://do/stop", {
      method: "POST",
    });

    if (!response.ok) {
      const error = `Failed to stop live tracker: ${response.status.toString()}`;
      this.logService.error(error, this.createLogParams(context));
      throw new Error(error);
    }

    const result = await response.json<LiveTrackerStopResponse>();
    this.logService.info("LiveTrackerService: Live tracker stopped successfully", this.createLogParams(context));
    return result;
  }

  /**
   * Refreshes a live tracker manually
   */
  async refreshTracker(context: LiveTrackerContext, matchCompleted?: boolean): Promise<LiveTrackerRefreshResponse> {
    this.logService.info("LiveTrackerService: Refreshing live tracker", this.createLogParams(context));

    const doStub = this.getDurableObjectStub(context);
    const request: LiveTrackerRefreshRequest = {
      matchCompleted: matchCompleted === true,
    };
    const response = await doStub.fetch("http://do/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    const result = await response.json<LiveTrackerRefreshResponse>();

    if (!response.ok) {
      if (response.status === 429) {
        this.logService.warn("Refresh cooldown active", this.createLogParams(context));
        return result;
      }

      const error = `Failed to refresh live tracker: ${response.status.toString()}`;
      this.logService.error(error, this.createLogParams(context));
      throw new Error(error);
    }

    this.logService.info("LiveTrackerService: Live tracker refreshed successfully", this.createLogParams(context));
    return result;
  }

  /**
   * Records a substitution in the live tracker
   */
  async recordSubstitution({
    context,
    playerOutId,
    playerInId,
  }: RecordSubstitutionOpts): Promise<LiveTrackerSubstitutionResponse> {
    this.logService.info(
      "LiveTrackerService: Recording substitution",
      this.createLogParams(
        context,
        new Map([
          ["playerOut", playerOutId],
          ["playerIn", playerInId],
        ]),
      ),
    );

    const doStub = this.getDurableObjectStub(context);
    const substitutionData: LiveTrackerSubstitutionRequest = {
      playerOutId,
      playerInId,
    };

    const response = await doStub.fetch("http://do/substitution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(substitutionData),
    });

    if (!response.ok) {
      const error = `Failed to record substitution: ${response.status.toString()}`;
      this.logService.error(error, this.createLogParams(context));
      throw new Error(error);
    }

    const result = await response.json<LiveTrackerSubstitutionResponse>();
    this.logService.info("LiveTrackerService: Substitution recorded successfully", this.createLogParams(context));
    return result;
  }

  /**
   * Gets the status of a live tracker
   */
  async getTrackerStatus(context: LiveTrackerContext): Promise<LiveTrackerStatusResponse | null> {
    const doStub = this.getDurableObjectStub(context);
    const response = await doStub.fetch("http://do/status", {
      method: "GET",
    });

    if (!response.ok) {
      return null;
    }

    return response.json<LiveTrackerStatusResponse>();
  }

  /**
   * Reposts a live tracker message to a new message
   */
  async repostTracker({ context, newMessageId }: RepostTrackerOpts): Promise<LiveTrackerRepostResponse> {
    this.logService.info(
      "LiveTrackerService: Reposting live tracker",
      this.createLogParams(context, new Map([["newMessageId", newMessageId]])),
    );

    const doStub = this.getDurableObjectStub(context);
    const repostData: LiveTrackerRepostRequest = {
      newMessageId,
    };

    const response = await doStub.fetch("http://do/repost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(repostData),
    });

    if (!response.ok) {
      const error = `Failed to repost live tracker: ${response.status.toString()}`;
      this.logService.error(error, this.createLogParams(context));
      throw new Error(error);
    }

    const result = await response.json<LiveTrackerRepostResponse>();
    this.logService.info("LiveTrackerService: Live tracker reposted successfully", this.createLogParams(context));
    return result;
  }

  /**
   * Discovers an active tracker for a guild/channel by checking for active queue data
   */
  async discoverActiveTracker({ guildId, channelId }: DiscoverActiveTrackerOpts): Promise<LiveTrackerState | null> {
    try {
      // First try to get active queue data to determine the queue number
      const activeQueueData = await this.discordService.getTeamsFromQueueChannel(guildId, channelId);
      if (!activeQueueData) {
        return null;
      }

      const context: LiveTrackerContext = {
        userId: "", // Not needed for status check
        guildId,
        channelId,
        queueNumber: activeQueueData.queue,
      };

      const statusResponse = await this.getTrackerStatus(context);
      return statusResponse?.state ?? null;
    } catch (error) {
      this.logService.error(
        "LiveTrackerService: Failed to discover active tracker",
        new Map([["error", String(error)]]),
      );
      return null;
    }
  }

  /**
   * Safely stops a tracker if it exists and is active
   */
  async safeStopIfActive({ guildId, channelId, queueNumber }: SafeStopIfActiveOpts): Promise<boolean> {
    const context: LiveTrackerContext = {
      userId: "",
      guildId,
      channelId,
      queueNumber,
    };

    try {
      const statusResponse = await this.getTrackerStatus(context);
      if (!statusResponse) {
        this.logService.debug("No tracker found to stop", this.createLogParams(context));
        return false;
      }

      const { state } = statusResponse;
      if (state.status !== "active" && state.status !== "paused") {
        this.logService.debug(
          "Tracker not in stoppable state",
          this.createLogParams(context, new Map([["status", state.status]])),
        );
        return false;
      }

      await this.stopTracker(context);
      this.logService.info("LiveTrackerService: Tracker stopped successfully", this.createLogParams(context));
      return true;
    } catch (error) {
      this.logService.warn(
        "LiveTrackerService: Failed to safely stop tracker",
        this.createLogParams(context, new Map([["error", String(error)]])),
      );
      return false;
    }
  }

  /**
   * Safely records a substitution if a tracker exists and is active
   */
  async safeRecordSubstitution({
    guildId,
    channelId,
    queueNumber,
    playerOutId,
    playerInId,
  }: SafeRecordSubstitutionOpts): Promise<boolean> {
    const context: LiveTrackerContext = {
      userId: "",
      guildId,
      channelId,
      queueNumber,
    };

    try {
      const statusResponse = await this.getTrackerStatus(context);
      if (!statusResponse) {
        this.logService.debug("LiveTrackerService: No tracker found for substitution", this.createLogParams(context));
        return false;
      }

      await this.recordSubstitution({ context, playerOutId, playerInId });
      return true;
    } catch (error) {
      this.logService.warn(
        "LiveTrackerService: Failed to safely record substitution",
        this.createLogParams(context, new Map([["error", String(error)]])),
      );
      return false;
    }
  }

  /**
   * Creates a fallback embed for error states
   */
  createErrorFallbackEmbed(context: LiveTrackerContext, status: "active" | "paused" | "stopped"): LiveTrackerEmbed {
    return new LiveTrackerEmbed(
      { discordService: this.discordService },
      {
        userId: context.userId,
        guildId: context.guildId,
        channelId: context.channelId,
        queueNumber: context.queueNumber,
        status,
        isPaused: false,
        lastUpdated: undefined,
        nextCheck: undefined,
        enrichedMatches: undefined,
        seriesScore: undefined,
        errorState: undefined,
      },
    );
  }

  /**
   * Handles refresh cooldown by updating the message embed
   */
  async handleRefreshCooldown({ interaction, response }: HandleRefreshCooldownOpts): Promise<void> {
    const [currentEmbed] = interaction.message.embeds;
    if (currentEmbed) {
      const updatedEmbed: APIEmbed = {
        ...currentEmbed,
        footer: {
          text: response.message,
        },
        timestamp: new Date().toISOString(),
      };

      await this.discordService.editMessage(interaction.channel.id, interaction.message.id, {
        embeds: [updatedEmbed],
        components: interaction.message.components,
      });
    }
  }

  /**
   * Creates a LiveTrackerEmbed from result data with fallback handling
   */
  createLiveTrackerEmbedFromResult({
    context,
    embedData,
    defaultStatus,
    additionalTime,
  }: CreateLiveTrackerEmbedFromResultOpts): LiveTrackerEmbed {
    if (embedData != null) {
      return new LiveTrackerEmbed({ discordService: this.discordService }, embedData);
    }

    const currentTime = new Date();
    return new LiveTrackerEmbed(
      { discordService: this.discordService },
      {
        userId: context.userId,
        guildId: context.guildId,
        channelId: context.channelId,
        queueNumber: context.queueNumber,
        status: defaultStatus,
        isPaused: defaultStatus === "paused",
        lastUpdated: currentTime,
        nextCheck: additionalTime,
        enrichedMatches: undefined,
        seriesScore: undefined,
        errorState: undefined,
      },
    );
  }

  private getDurableObjectStub(context: LiveTrackerContext): DurableObjectStub<LiveTrackerDO> {
    const doId = this.env.LIVE_TRACKER_DO.idFromName(`${context.guildId}:${context.queueNumber.toString()}`);

    return this.env.LIVE_TRACKER_DO.get(doId);
  }

  private createLogParams(
    context: LiveTrackerContext,
    additionalParams = new Map<string, string>(),
  ): Map<string, string> {
    const params = new Map([
      ["guildId", context.guildId],
      ["channelId", context.channelId],
      ["queueNumber", context.queueNumber.toString()],
      ["userId", context.userId],
    ]);

    for (const [key, value] of additionalParams) {
      params.set(key, value);
    }

    return params;
  }
}
