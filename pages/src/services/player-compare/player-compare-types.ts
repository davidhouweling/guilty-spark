import type { PlayerCompareResponse } from "@guilty-spark/shared/contracts/stats/player";
import type { LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";

export interface PlayerCompareRequest {
  readonly gamertags: readonly string[];
  readonly guildId?: string | undefined;
  readonly queueChannelId?: string | undefined;
  readonly window?: LeaderboardWindow | undefined;
  readonly minGamesPlayed?: number | undefined;
}

export interface PlayerCompareService {
  getPlayerCompare(request: PlayerCompareRequest): Promise<PlayerCompareResponse>;
}
