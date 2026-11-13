import type { DiscordSeriesStats } from "@guilty-spark/shared/contracts/stats/discord-series";
import type { SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";

export interface DiscordSeriesStatsDetailResult {
  readonly status: number;
  readonly data: SeriesDetailResponse | Exclude<DiscordSeriesStats, { status: "resolved" }>;
  readonly retryAfterSeconds: number | null;
}

export interface DiscordSeriesStatsResult {
  readonly status: number;
  readonly data: DiscordSeriesStats;
  readonly retryAfterSeconds: number | null;
}

export interface DiscordSeriesStatsLookupResult {
  readonly status: number;
  readonly retryAfterSeconds: number | null;
}

export interface DiscordSeriesStatsService {
  getStats(guildId: string, queueNumber: string): Promise<DiscordSeriesStatsResult>;
  getDetail(guildId: string, queueNumber: string): Promise<DiscordSeriesStatsDetailResult>;
  getLookup(guildId: string, queueNumber: string): Promise<DiscordSeriesStatsLookupResult>;
}
