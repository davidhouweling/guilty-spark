import type { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";

export interface LeaderboardPostRow {
  ChannelId: string;
  MessageId: string;
  GuildId: string;
  QueueChannelId: string | null;
  Window: LeaderboardWindow;
  Metric: LeaderboardMetric;
  MinGamesPlayed: number;
  Page: number;
  Locale: string;
  CreatedAt: number;
  UpdatedAt: number;
}