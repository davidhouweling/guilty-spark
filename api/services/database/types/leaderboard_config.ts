import type { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";

export interface LeaderboardConfigRow {
  GuildId: string;
  EnabledWindowsJson: string;
  DefaultWindow: LeaderboardWindow;
  DefaultMetric: LeaderboardMetric;
  MinGamesPlayed: number;
  UpdatedAt: number;
}
