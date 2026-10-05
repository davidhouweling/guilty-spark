import type { LeaderboardPlayerRelationshipMetric } from "@guilty-spark/shared/halo/leaderboard-formatting";
import { LeaderboardMetric } from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardMetricAggregation, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { PlayerStatsQueueOption } from "../../embeds/stats/player-stats-embed";
import {
  createPlayerStatsEmbeds,
  createPlayerStatsRelationshipEmbeds,
  getPlayerStatsMetricsForAggregation,
} from "../../embeds/stats/player-stats-embed";
import type { NeatQueueConfigRow } from "../../services/database/types/neat_queue_config";
import { StatsGamesCommand } from "./stats-games-command";

export abstract class StatsPlayerResponseCommand extends StatsGamesCommand {
  protected async createPlayerStatsResponse({
    guildId,
    xboxXuid,
    queueChannelId,
    configuredQueues,
    aggregation,
    relationshipMetric,
    window,
    locale,
  }: {
    guildId: string;
    xboxXuid: string;
    queueChannelId: string | null;
    configuredQueues: NeatQueueConfigRow[];
    aggregation: LeaderboardMetricAggregation | null;
    relationshipMetric: LeaderboardPlayerRelationshipMetric | null;
    window: LeaderboardWindow | undefined;
    locale: string;
  }): Promise<ReturnType<typeof createPlayerStatsEmbeds> | null> {
    const configuredQueueChannelIds = configuredQueues.map((queue) => queue.ChannelId);
    if (relationshipMetric != null) {
      const relationshipResult = await this.services.leaderboardService.getLeaderboardPlayerRelationships({
        guildId,
        xboxXuid,
        queueChannelId,
        ...(queueChannelId == null ? { queueChannelIds: configuredQueueChannelIds } : {}),
        ...(window == null ? {} : { window }),
        metric: relationshipMetric,
      });
      if (relationshipResult == null) {
        return null;
      }

      const queueOptions = await this.getPlayerStatsQueueOptions({
        guildId,
        xboxXuid,
        configuredQueues,
        window: relationshipResult.window,
      });
      return createPlayerStatsRelationshipEmbeds({
        targetGamertag: relationshipResult.stats.Gamertag,
        rows: relationshipResult.rows,
        state: {
          aggregation: null,
          relationshipMetric,
          gamertag: relationshipResult.stats.Gamertag,
          queueChannelId,
          window: relationshipResult.window,
        },
        locale,
        guildId,
        queueLabel: this.getPlayerStatsQueueLabel(queueChannelId, queueOptions),
        queueOptions,
        resetAt: relationshipResult.resetAt,
        pagesUrl: this.env.PAGES_URL,
      });
    }

    const result = await this.services.leaderboardService.getLeaderboardPlayerStats({
      guildId,
      xboxXuid,
      queueChannelId,
      ...(queueChannelId == null ? { queueChannelIds: configuredQueueChannelIds } : {}),
      ...(window == null ? {} : { window }),
    });
    if (result == null) {
      return null;
    }

    const selectedAggregation = aggregation ?? result.defaultAggregation;
    const metrics = getPlayerStatsMetricsForAggregation(selectedAggregation);
    const rankMetrics = metrics.includes(LeaderboardMetric.GamesPlayed)
      ? metrics
      : [LeaderboardMetric.GamesPlayed, ...metrics];
    const ranks = await this.services.leaderboardService.getLeaderboardPlayerMetricRanks({
      guildId,
      xboxXuid,
      queueChannelId,
      ...(queueChannelId == null ? { queueChannelIds: configuredQueueChannelIds } : {}),
      startEpochSeconds: result.startEpochSeconds,
      minGamesPlayed: result.minGamesPlayed,
      metrics: rankMetrics,
    });
    const queueOptions = await this.getPlayerStatsQueueOptions({
      guildId,
      xboxXuid,
      configuredQueues,
      window: result.window,
    });

    return createPlayerStatsEmbeds({
      stats: result.stats,
      ranks,
      state: {
        aggregation: selectedAggregation,
        relationshipMetric: null,
        gamertag: result.stats.Gamertag,
        queueChannelId,
        window: result.window,
      },
      locale,
      guildId,
      queueLabel: this.getPlayerStatsQueueLabel(queueChannelId, queueOptions),
      queueOptions,
      resetAt: result.resetAt,
      minGamesPlayed: result.minGamesPlayed,
      pagesUrl: this.env.PAGES_URL,
    });
  }

  private async getPlayerStatsQueueOptions({
    guildId,
    xboxXuid,
    configuredQueues,
    window,
  }: {
    guildId: string;
    xboxXuid: string;
    configuredQueues: NeatQueueConfigRow[];
    window: LeaderboardWindow;
  }): Promise<PlayerStatsQueueOption[]> {
    const maxPlayedQueueOptions = 24;
    const queueProbeBatchSize = 8;
    const playedQueues: PlayerStatsQueueOption[] = [];
    const queueChannelNames = await this.getQueueChannelNames(guildId, configuredQueues);

    // Reset markers can differ per queue, so each queue's eligibility is resolved independently. Small concurrent
    // batches reduce round-trips without creating an unbounded burst across all configured queues.
    for (let batchStart = 0; batchStart < configuredQueues.length; batchStart += queueProbeBatchSize) {
      if (playedQueues.length >= maxPlayedQueueOptions) {
        break;
      }

      const batch = configuredQueues.slice(batchStart, batchStart + queueProbeBatchSize);
      const batchResults = await Promise.all(
        batch.map(async (queue) => ({
          queue,
          result: await this.services.leaderboardService.getLeaderboardPlayerStats({
            guildId,
            xboxXuid,
            queueChannelId: queue.ChannelId,
            window,
          }),
        })),
      );

      for (const { queue, result } of batchResults) {
        if (result != null && playedQueues.length < maxPlayedQueueOptions) {
          playedQueues.push({
            label: this.getQueueOptionLabel(queue.ChannelId, queueChannelNames),
            value: queue.ChannelId,
          });
        }
      }
    }

    if (playedQueues.length <= 1) {
      return playedQueues;
    }

    return [{ label: "All configured queues", value: null }, ...playedQueues.slice(0, maxPlayedQueueOptions)];
  }
}
