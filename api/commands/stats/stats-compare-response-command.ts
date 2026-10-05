import { LeaderboardMetric } from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardMetricAggregation, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { PlayerStatsQueueOption } from "../../embeds/stats/player-stats-embed";
import { getPlayerStatsMetricsForAggregation } from "../../embeds/stats/player-stats-embed";
import {
  createPlayerCompareEmbeds,
  createPlayerCompareHeadToHeadEmbeds,
} from "../../embeds/stats/player-compare-embed";
import type { NeatQueueConfigRow } from "../../services/database/types/neat_queue_config";
import { StatsPlayerResponseCommand } from "./stats-player-response-command";

export abstract class StatsCompareResponseCommand extends StatsPlayerResponseCommand {
  protected async createPlayerCompareResponse({
    guildId,
    xboxXuid1,
    xboxXuid2,
    queueChannelId,
    configuredQueues,
    aggregation,
    headToHead,
    window,
    locale,
  }: {
    guildId: string;
    xboxXuid1: string;
    xboxXuid2: string;
    queueChannelId: string | null;
    configuredQueues: NeatQueueConfigRow[];
    aggregation: LeaderboardMetricAggregation | null;
    headToHead: boolean;
    window: LeaderboardWindow | undefined;
    locale: string;
  }): Promise<
    ReturnType<typeof createPlayerCompareEmbeds> | ReturnType<typeof createPlayerCompareHeadToHeadEmbeds> | null
  > {
    const configuredQueueChannelIds = configuredQueues.map((queue) => queue.ChannelId);
    const queueChannelIdsOpt = queueChannelId == null ? { queueChannelIds: configuredQueueChannelIds } : {};

    const result1 = await this.services.leaderboardService.getLeaderboardPlayerStats({
      guildId,
      xboxXuid: xboxXuid1,
      queueChannelId,
      ...queueChannelIdsOpt,
      ...(window == null ? {} : { window }),
    });
    if (result1 == null) {
      return null;
    }

    // Force the second lookup to resolve against the exact same window as the first so both
    // players' stats are scoped identically, even when the window was left to resolve a default.
    const result2 = await this.services.leaderboardService.getLeaderboardPlayerStats({
      guildId,
      xboxXuid: xboxXuid2,
      queueChannelId,
      ...queueChannelIdsOpt,
      window: result1.window,
    });
    if (result2 == null) {
      return null;
    }

    const queueOptions = await this.getCompareQueueOptions(guildId, configuredQueues);
    const queueLabel = this.getPlayerStatsQueueLabel(queueChannelId, queueOptions);

    if (headToHead) {
      const pair = await this.services.leaderboardService.getLeaderboardPlayerPairRelationship({
        guildId,
        xboxXuid1: result1.stats.XboxXuid,
        xboxXuid2: result2.stats.XboxXuid,
        queueChannelId,
        ...queueChannelIdsOpt,
        startEpochSeconds: result1.startEpochSeconds,
      });

      return createPlayerCompareHeadToHeadEmbeds({
        pair,
        stats1: result1.stats,
        stats2: result2.stats,
        state: {
          xboxXuid1: result1.stats.XboxXuid,
          xboxXuid2: result2.stats.XboxXuid,
          queueChannelId,
          window: result1.window,
          aggregation: null,
          headToHead: true,
        },
        queueLabel,
        queueOptions,
        resetAt: result1.resetAt,
        locale,
      });
    }

    const selectedAggregation = aggregation ?? result1.defaultAggregation;
    const metrics = getPlayerStatsMetricsForAggregation(selectedAggregation);
    const rankMetrics = metrics.includes(LeaderboardMetric.GamesPlayed)
      ? metrics
      : [LeaderboardMetric.GamesPlayed, ...metrics];
    const [ranks1, ranks2] = await Promise.all([
      this.services.leaderboardService.getLeaderboardPlayerMetricRanks({
        guildId,
        xboxXuid: xboxXuid1,
        queueChannelId,
        ...queueChannelIdsOpt,
        startEpochSeconds: result1.startEpochSeconds,
        minGamesPlayed: result1.minGamesPlayed,
        metrics: rankMetrics,
      }),
      this.services.leaderboardService.getLeaderboardPlayerMetricRanks({
        guildId,
        xboxXuid: xboxXuid2,
        queueChannelId,
        ...queueChannelIdsOpt,
        startEpochSeconds: result1.startEpochSeconds,
        minGamesPlayed: result1.minGamesPlayed,
        metrics: rankMetrics,
      }),
    ]);

    return createPlayerCompareEmbeds({
      stats1: result1.stats,
      stats2: result2.stats,
      ranks1,
      ranks2,
      state: {
        xboxXuid1: result1.stats.XboxXuid,
        xboxXuid2: result2.stats.XboxXuid,
        queueChannelId,
        window: result1.window,
        aggregation: selectedAggregation,
        headToHead: false,
      },
      locale,
      queueLabel,
      queueOptions,
      resetAt: result1.resetAt,
    });
  }

  private async getCompareQueueOptions(
    guildId: string,
    configuredQueues: readonly NeatQueueConfigRow[],
  ): Promise<PlayerStatsQueueOption[]> {
    const queueChannelNames = await this.getQueueChannelNames(guildId, configuredQueues);
    const queueOptions = configuredQueues.map((queue) => ({
      label: this.getQueueOptionLabel(queue.ChannelId, queueChannelNames),
      value: queue.ChannelId,
    }));
    return queueOptions.length <= 1 ? queueOptions : [{ label: "All configured queues", value: null }, ...queueOptions];
  }
}
