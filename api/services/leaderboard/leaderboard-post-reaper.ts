import { DiscordError } from "../discord/discord-error";
import type { DatabaseService } from "../database/database";
import type { LeaderboardPostRow } from "../database/types/leaderboard_post";
import type { DiscordService } from "../discord/discord";
import type { LogService } from "../log/types";

export interface LeaderboardPostReaperOpts {
  databaseService: DatabaseService;
  discordService: DiscordService;
  logService: LogService;
}

export class LeaderboardPostReaper {
  private readonly databaseService: DatabaseService;
  private readonly discordService: DiscordService;
  private readonly logService: LogService;

  constructor({ databaseService, discordService, logService }: LeaderboardPostReaperOpts) {
    this.databaseService = databaseService;
    this.discordService = discordService;
    this.logService = logService;
  }

  async execute(): Promise<void> {
    const posts = await this.databaseService.getAllLeaderboardPosts();
    let deletedCount = 0;

    for (const post of posts) {
      if (await this.reapPost(post)) {
        deletedCount += 1;
      }
    }

    this.logService.info(
      "LeaderboardPostReaper: completed",
      new Map([
        ["totalPosts", posts.length.toString()],
        ["deletedPosts", deletedCount.toString()],
      ]),
    );
  }

  private async reapPost(post: LeaderboardPostRow): Promise<boolean> {
    try {
      await this.discordService.getMessage(post.ChannelId, post.MessageId);
      return false;
    } catch (error) {
      const isConfirmedMissingResource =
        error instanceof DiscordError &&
        error.httpStatus === 404 &&
        (error.restError.code === 10003 || error.restError.code === 10008);
      if (!isConfirmedMissingResource) {
        this.logService.warn(
          error,
          new Map([
            ["guildId", post.GuildId],
            ["channelId", post.ChannelId],
            ["messageId", post.MessageId],
            ["reason", "Failed to validate leaderboard post during reap"],
          ]),
        );
        return false;
      }

      return await this.deletePost(post);
    }
  }

  private async deletePost(post: LeaderboardPostRow): Promise<boolean> {
    try {
      await this.databaseService.deleteLeaderboardPost(post.ChannelId, post.MessageId);
      this.logService.info(
        "LeaderboardPostReaper: deleted missing leaderboard post registration",
        new Map([
          ["guildId", post.GuildId],
          ["channelId", post.ChannelId],
          ["messageId", post.MessageId],
        ]),
      );
      return true;
    } catch (error) {
      this.logService.warn(
        error,
        new Map([
          ["guildId", post.GuildId],
          ["channelId", post.ChannelId],
          ["messageId", post.MessageId],
          ["reason", "Failed to delete missing leaderboard post registration during reap"],
        ]),
      );
      return false;
    }
  }
}
