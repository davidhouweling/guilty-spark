import type { APIMessage } from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { ExistingSeriesStatsThreadLocation, QueueData } from "../../services/discord/discord";
import type { NeatQueueConfigRow } from "../../services/database/types/neat_queue_config";
import { NeatQueuePostSeriesDisplayMode } from "../../services/database/types/neat_queue_config";
import type { SeriesOverviewEmbedOutput } from "../../embeds/stats/series-overview-embed";
import type { FixFlowMetadata, FixSeriesSourceKind } from "./stats-flow-types";
import { StatsFixGamesCommand } from "./stats-fix-games-command";

export abstract class StatsFixMaintenanceCommand extends StatsFixGamesCommand {
  protected getNeatQueueResultThreadLocation(
    neatQueueMessage: QueueData["message"],
  ): ExistingSeriesStatsThreadLocation | undefined {
    return neatQueueMessage.thread != null ? { threadId: neatQueueMessage.thread.id } : undefined;
  }

  protected async createFixSeriesStatsThread({
    metadata,
    neatQueueConfig,
    seriesEmbed,
    threadName,
  }: {
    metadata: FixFlowMetadata;
    neatQueueConfig: NeatQueueConfigRow | undefined;
    seriesEmbed: SeriesOverviewEmbedOutput;
    threadName: string;
  }): Promise<{ threadId: string; shouldPostOverviewInThread: boolean }> {
    const { discordService, logService } = this.services;

    if (neatQueueConfig?.PostSeriesMode === NeatQueuePostSeriesDisplayMode.THREAD) {
      try {
        const thread = await discordService.startThreadFromMessage(
          metadata.channelId,
          metadata.queueData.message.id,
          threadName,
        );
        return { threadId: thread.id, shouldPostOverviewInThread: true };
      } catch (error) {
        logService.warn(
          error,
          new Map([
            ["guildId", metadata.guildId],
            ["channelId", metadata.channelId],
            ["queue", metadata.queueData.queue.toString()],
            ["reason", "Failed to start thread from NeatQueue result, falling back to channel post"],
          ]),
        );
      }
    }

    const postChannelId =
      neatQueueConfig?.PostSeriesChannelId ?? neatQueueConfig?.ResultsChannelId ?? metadata.channelId;
    const seriesOverviewMessage = await discordService.createMessage(postChannelId, {
      embeds: seriesEmbed.embeds,
      components: seriesEmbed.components,
    });
    const thread = await discordService.startThreadFromMessage(postChannelId, seriesOverviewMessage.id, threadName);
    return { threadId: thread.id, shouldPostOverviewInThread: false };
  }

  protected async deletePreviousSeriesErrorMessages(
    metadata: FixFlowMetadata,
    neatQueueConfig: NeatQueueConfigRow | undefined,
  ): Promise<void> {
    const { discordService, logService } = this.services;
    const resultsChannelId = neatQueueConfig?.ResultsChannelId ?? metadata.channelId;
    const postChannelId = neatQueueConfig?.PostSeriesChannelId ?? resultsChannelId;

    try {
      const errorMessages = await discordService.findSeriesErrorMessagesInChannel(metadata.guildId, postChannelId, {
        queueNumber: metadata.queueData.queue,
        resultsChannelId,
        afterMessageId: metadata.queueData.message.id,
      });
      await this.deleteMessagesInChunks(
        postChannelId,
        errorMessages.map((message) => message.id),
        "Replacing amended series stats",
      );
    } catch (error) {
      logService.warn(
        error,
        new Map([
          ["guildId", metadata.guildId],
          ["channelId", postChannelId],
          ["queue", metadata.queueData.queue.toString()],
          ["reason", "Failed to clean up previous series error messages"],
        ]),
      );
    }
  }

  protected async persistFixedSeriesToLeaderboard(
    metadata: FixFlowMetadata,
    neatQueueConfig: NeatQueueConfigRow,
    series: MatchStats[],
    locale: string,
  ): Promise<void> {
    try {
      await this.services.leaderboardService.persistReconciledSeriesData({
        guildId: metadata.guildId,
        channelId: neatQueueConfig.ChannelId,
        queueNumber: metadata.queueData.queue,
        neatQueueConfig,
        series,
        winnerTeamIndex:
          metadata.selectedSeriesOutcome === "TEAM_0" ? 0 : metadata.selectedSeriesOutcome === "TEAM_1" ? 1 : -1,
        locale,
      });
    } catch (error) {
      this.services.logService.warn(
        error,
        new Map([
          ["context", "Stats fix leaderboard reconciliation failed"],
          ["guildId", metadata.guildId],
          ["channelId", metadata.channelId],
          ["queue", metadata.queueData.queue.toString()],
        ]),
      );
    }
  }

  protected async tryResolveNeatQueueConfigForResultsChannel(
    guildId: string,
    resultsChannelId: string,
    sourceKind: FixSeriesSourceKind,
    sourceMessage: APIMessage,
  ): Promise<NeatQueueConfigRow | undefined> {
    try {
      return await this.resolveNeatQueueConfigForResultsChannel(guildId, resultsChannelId, sourceKind, sourceMessage);
    } catch (error) {
      this.services.logService.warn(
        error,
        new Map([
          ["context", "Stats fix queue config resolution failed"],
          ["guildId", guildId],
          ["channelId", resultsChannelId],
        ]),
      );
      return undefined;
    }
  }

  private async resolveNeatQueueConfigForResultsChannel(
    guildId: string,
    resultsChannelId: string,
    sourceKind: FixSeriesSourceKind,
    sourceMessage: APIMessage,
  ): Promise<NeatQueueConfigRow> {
    const configuredQueues = await this.services.databaseService.findNeatQueueConfig({ GuildId: guildId });
    const linkedSource =
      sourceKind === "series-overview" ? this.getLinkedQueueSourceFromOverview(sourceMessage, guildId) : undefined;
    const isSelfLink =
      linkedSource?.channelId === sourceMessage.channel_id && linkedSource.messageId === sourceMessage.id;
    if (linkedSource != null && !isSelfLink && linkedSource.messageId == null) {
      const linkedQueueMatches = this.findNeatQueueConfigs(configuredQueues, linkedSource.channelId, "ChannelId");
      if (linkedQueueMatches.length === 1) {
        return Preconditions.checkExists(linkedQueueMatches[0]);
      }
    } else if (linkedSource != null && !isSelfLink) {
      const linkedResultsMatches = this.findNeatQueueConfigs(
        configuredQueues,
        linkedSource.channelId,
        "ResultsChannelId",
      );
      if (linkedResultsMatches.length === 1) {
        return Preconditions.checkExists(linkedResultsMatches[0]);
      }
    }

    return this.resolveNeatQueueConfigForChannelRole(configuredQueues, resultsChannelId, sourceKind);
  }

  private resolveNeatQueueConfigForChannelRole(
    configuredQueues: NeatQueueConfigRow[],
    channelId: string,
    sourceKind: FixSeriesSourceKind,
  ): NeatQueueConfigRow {
    const channelRoles: ("PostSeriesChannelId" | "ResultsChannelId" | "ChannelId")[] =
      sourceKind === "series-overview"
        ? ["PostSeriesChannelId", "ResultsChannelId", "ChannelId"]
        : ["ChannelId", "ResultsChannelId", "PostSeriesChannelId"];
    for (const channelRole of channelRoles) {
      const matches = this.findNeatQueueConfigs(configuredQueues, channelId, channelRole);
      if (matches.length === 1) {
        return Preconditions.checkExists(matches[0]);
      }
      if (matches.length > 1) {
        throw new Error(`Expected exactly one NeatQueue config for ${channelRole} ${channelId}`);
      }
    }

    throw new Error(`Could not find a NeatQueue config for channel ${channelId}`);
  }

  private findNeatQueueConfigs(
    configuredQueues: NeatQueueConfigRow[],
    channelId: string,
    channelRole: "PostSeriesChannelId" | "ResultsChannelId" | "ChannelId",
  ): NeatQueueConfigRow[] {
    return configuredQueues.filter((queue) => queue[channelRole] === channelId);
  }

  protected async deleteMessagesInChunks(channelId: string, messageIds: string[], reason: string): Promise<void> {
    const { discordService, logService } = this.services;

    for (let start = 0; start < messageIds.length; start += 100) {
      const chunk = messageIds.slice(start, start + 100);
      if (chunk.length === 0) {
        continue;
      }
      if (chunk.length === 1) {
        await discordService.deleteMessage(channelId, Preconditions.checkExists(chunk[0]), reason);
        continue;
      }
      try {
        await discordService.bulkDeleteMessages(channelId, chunk, reason);
      } catch (error) {
        logService.warn(
          error,
          new Map([
            ["channelId", channelId],
            ["messageCount", chunk.length.toString()],
            ["reason", "Bulk delete failed, falling back to per-message delete"],
          ]),
        );
        for (const messageId of chunk) {
          await discordService.deleteMessage(channelId, messageId, reason);
        }
      }
    }
  }
}
