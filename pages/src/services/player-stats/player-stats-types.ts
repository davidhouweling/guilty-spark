import type { PlayerStatsResponse } from "@guilty-spark/shared/contracts/stats/player";
import type { LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";

export interface PlayerStatsRequest {
  readonly gamertag: string;
  readonly guildId?: string | undefined;
  readonly queueChannelId?: string | undefined;
  readonly window?: LeaderboardWindow | undefined;
  readonly minGamesPlayed?: number | undefined;
}

export interface PlayerStatsService {
  getPlayerStats(request: PlayerStatsRequest): Promise<PlayerStatsResponse>;
}
