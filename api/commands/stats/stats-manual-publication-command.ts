import type { APIMessage } from "discord-api-types/v10";
import { ChannelType, PermissionFlagsBits } from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { toMissingPermissionsError } from "../../base/missing-permissions-error";
import type { SeriesOverviewEmbedOutput } from "../../embeds/stats/series-overview-embed";
import type { NeatQueueConfigRow } from "../../services/database/types/neat_queue_config";
import {
  resolveManualSeriesTeamMappings,
  mapManualSeriesToStableTeams,
} from "../../services/halo/manual-series-team-mapping";
import type { ManualFlowMetadata, FixSeriesOutcome } from "./stats-flow-types";
import { StatsManualGamesCommand } from "./stats-manual-games-command";

export abstract class StatsManualPublicationCommand extends StatsManualGamesCommand {
  protected async findManualQueueConfig(metadata: ManualFlowMetadata): Promise<NeatQueueConfigRow | undefined> {
    if (metadata.queueChannelId == null) {
      return undefined;
    }

    const configuredQueues = await this.services.databaseService.findNeatQueueConfig({ GuildId: metadata.guildId });
    return configuredQueues.find((queue) => queue.ChannelId === metadata.queueChannelId);
  }

  protected async postManualSeriesOverview({
    postChannelId,
    seriesEmbed,
    threadName,
  }: {
    postChannelId: string;
    seriesEmbed: SeriesOverviewEmbedOutput;
    threadName: string;
  }): Promise<{
    threadId: string;
    allowLoadGamesButton: boolean;
    messageIds: string[];
    overviewChannelId: string;
    overviewMessageId?: string | undefined;
    createdThread: boolean;
  }> {
    const { discordService } = this.services;
    const content = { embeds: seriesEmbed.embeds, components: seriesEmbed.components };
    const postChannel = await discordService.getChannel(postChannelId);
    if (this.isThreadChannel(postChannel.type)) {
      const overviewMessage = await discordService.createMessage(postChannelId, content);
      return {
        threadId: postChannelId,
        allowLoadGamesButton: false,
        messageIds: [overviewMessage.id],
        overviewChannelId: postChannelId,
        createdThread: false,
      };
    }

    let overviewMessage: APIMessage | undefined;
    try {
      overviewMessage = await discordService.createMessage(postChannelId, content);
      const thread = await discordService.startThreadFromMessage(postChannelId, overviewMessage.id, threadName);
      return {
        threadId: thread.id,
        allowLoadGamesButton: thread.type === ChannelType.PublicThread,
        messageIds: [],
        overviewChannelId: postChannelId,
        overviewMessageId: overviewMessage.id,
        createdThread: true,
      };
    } catch (error) {
      if (overviewMessage != null) {
        try {
          await discordService.deleteMessage(
            postChannelId,
            overviewMessage.id,
            "Removing manual series overview after thread creation failed",
          );
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "Failed to create a manual series thread and clean up its overview message",
            { cause: cleanupError },
          );
        }
      }

      throw (
        toMissingPermissionsError(error, {
          action: "post the series stats",
          permissions: [
            discordService.permissionToString(PermissionFlagsBits.SendMessages),
            discordService.permissionToString(PermissionFlagsBits.CreatePublicThreads),
          ],
        }) ?? error
      );
    }
  }

  protected async rollbackManualSeriesPublication(
    publication: {
      threadId: string;
      messageIds: string[];
      overviewChannelId: string;
      overviewMessageId?: string | undefined;
      createdThread: boolean;
    },
    originalError: unknown,
  ): Promise<never> {
    const { discordService } = this.services;
    const cleanupErrors: unknown[] = [];
    let threadDeleted = false;

    if (publication.createdThread) {
      try {
        await discordService.deleteChannel(publication.threadId, "Removing incomplete manual series thread");
        threadDeleted = true;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if ((!publication.createdThread || !threadDeleted) && publication.messageIds.length > 0) {
      for (const messageId of publication.messageIds) {
        try {
          await discordService.deleteMessage(
            publication.threadId,
            messageId,
            "Removing incomplete manual series stats",
          );
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
    }

    if (publication.overviewMessageId != null) {
      try {
        await discordService.deleteMessage(
          publication.overviewChannelId,
          publication.overviewMessageId,
          "Removing manual series overview after stats publication failed",
        );
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [originalError, ...cleanupErrors],
        "Failed to publish manual series stats and clean up the partial publication",
        { cause: originalError },
      );
    }

    throw originalError;
  }

  protected async persistManualSeriesToLeaderboard(
    metadata: ManualFlowMetadata,
    queueConfig: NeatQueueConfigRow,
    series: MatchStats[],
    locale: string,
  ): Promise<void> {
    try {
      const mappings = Preconditions.checkExists(
        resolveManualSeriesTeamMappings(series),
        "Cannot resolve stable team identities from the manual series rosters",
      );
      await this.services.leaderboardService.persistReconciledSeriesData({
        guildId: metadata.guildId,
        channelId: queueConfig.ChannelId,
        queueNumber: metadata.queueNumber,
        neatQueueConfig: queueConfig,
        series,
        winnerTeamIndex: this.getManualWinnerTeamId(series, metadata.selectedSeriesOutcome),
        seriesTeamIdByXuid: mappings.playerToSeriesTeamId,
        seriesScore:
          this.getManualSeriesScoreOverride(metadata, locale, false) ??
          this.services.haloService.getSeriesScore(mapManualSeriesToStableTeams(series, mappings), locale),
        locale,
      });
    } catch (error) {
      this.services.logService.warn(
        error,
        new Map([
          ["context", "Manual stats leaderboard persistence failed"],
          ["guildId", metadata.guildId],
          ["queue", metadata.queueNumber.toString()],
        ]),
      );
    }
  }

  private getManualWinnerTeamId(series: MatchStats[], selectedSeriesOutcome: FixSeriesOutcome | undefined): number {
    if (selectedSeriesOutcome === "TIE") {
      return -1;
    }

    const [firstMatch] = [...series].sort((left, right) =>
      left.MatchInfo.StartTime.localeCompare(right.MatchInfo.StartTime),
    );
    const sortedTeams = [...Preconditions.checkExists(firstMatch).Teams].sort(
      (left, right) => left.TeamId - right.TeamId,
    );
    const winningTeam = sortedTeams[selectedSeriesOutcome === "TEAM_0" ? 0 : 1];
    return Preconditions.checkExists(winningTeam, "Expected winning team in first match").TeamId;
  }
}
