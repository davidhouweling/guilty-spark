import type { LeaderboardResponse } from "@guilty-spark/shared/contracts/leaderboard/leaderboard";
import type { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";

export interface LeaderboardRequest {
  readonly guildId: string;
  readonly queueChannelId: string | null;
  readonly window?: LeaderboardWindow | undefined;
  readonly metric?: LeaderboardMetric | undefined;
}

export interface LeaderboardService {
  getLeaderboard(request: LeaderboardRequest): Promise<LeaderboardResponse>;
  getQueueOptions(guildId: string): Promise<LeaderboardQueueOptionsResponse>;
}

export interface LeaderboardQueueOption {
  readonly channelId: string;
  readonly label: string;
}

export interface LeaderboardQueueOptionsResponse {
  readonly guildName: string;
  readonly options: readonly LeaderboardQueueOption[];
}
