import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { DatabaseService } from "../database/database";
import type { NeatQueueConfigRow } from "../database/types/neat_queue_config";
import type { DiscordService } from "../discord/discord";
import { DiscordError } from "../discord/discord-error";
import type { LogService } from "../log/types";

export interface StaleNeatQueueConfigCleanupOpts {
  databaseService: DatabaseService;
  discordService: DiscordService;
  logService: LogService;
}

type QueueChannelStatus = "exists" | "deleted" | "inaccessible" | "unknown";

export class StaleNeatQueueConfigCleanup {
  private readonly databaseService: DatabaseService;
  private readonly discordService: DiscordService;
  private readonly logService: LogService;
  private readonly guildAccessCache = new Map<string, boolean>();

  constructor({ databaseService, discordService, logService }: StaleNeatQueueConfigCleanupOpts) {
    this.databaseService = databaseService;
    this.discordService = discordService;
    this.logService = logService;
  }

  async execute(): Promise<void> {
    const configs = await this.databaseService.getAllNeatQueueConfigs();
    let deletedCount = 0;

    for (const config of configs) {
      const isStale = await this.isConfigStale(config);
      if (!isStale) {
        continue;
      }

      await this.databaseService.deleteNeatQueueConfig(config.GuildId, config.ChannelId);
      deletedCount += 1;
      this.logService.info(
        "StaleNeatQueueConfigCleanup: deleted stale config",
        new Map([
          ["guildId", config.GuildId],
          ["channelId", config.ChannelId],
        ]),
      );
    }

    this.logService.info(
      "StaleNeatQueueConfigCleanup: completed",
      new Map([
        ["totalConfigs", configs.length.toString()],
        ["deletedConfigs", deletedCount.toString()],
      ]),
    );
  }

  private async isConfigStale(config: NeatQueueConfigRow): Promise<boolean> {
    const status = await this.getQueueChannelStatus(config);

    switch (status) {
      case "exists": {
        return false;
      }
      case "deleted": {
        return true;
      }
      case "inaccessible": {
        return this.isBotRemovedFromGuild(config.GuildId);
      }
      case "unknown": {
        return false;
      }
      default: {
        throw new UnreachableError(status);
      }
    }
  }

  private async getQueueChannelStatus(config: NeatQueueConfigRow): Promise<QueueChannelStatus> {
    try {
      await this.discordService.getChannel(config.ChannelId);
      return "exists";
    } catch (error) {
      if (error instanceof DiscordError && error.httpStatus === 404) {
        return "deleted";
      }
      if (error instanceof DiscordError && error.httpStatus === 403) {
        return "inaccessible";
      }

      this.logService.warn(
        "StaleNeatQueueConfigCleanup: unexpected error fetching queue channel, keeping config",
        new Map([
          ["guildId", config.GuildId],
          ["channelId", config.ChannelId],
          ["error", String(error)],
        ]),
      );
      return "unknown";
    }
  }

  private async isBotRemovedFromGuild(guildId: string): Promise<boolean> {
    const cached = this.guildAccessCache.get(guildId);
    if (cached != null) {
      return cached;
    }

    let removed = false;
    try {
      await this.discordService.getGuild(guildId);
    } catch (error) {
      if (error instanceof DiscordError && (error.httpStatus === 404 || error.httpStatus === 403)) {
        removed = true;
      } else {
        this.logService.warn(
          "StaleNeatQueueConfigCleanup: unexpected error fetching guild, keeping config",
          new Map([
            ["guildId", guildId],
            ["error", String(error)],
          ]),
        );
      }
    }

    this.guildAccessCache.set(guildId, removed);
    return removed;
  }
}
