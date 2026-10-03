import type { DiscordSeriesStats } from "@guilty-spark/shared/contracts/stats/discord-series";

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
  getLookup(guildId: string, queueNumber: string): Promise<DiscordSeriesStatsLookupResult>;
}
