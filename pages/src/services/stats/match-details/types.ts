import type { MatchDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";

export interface MatchDetailsService {
  getMatchDetails(matchIds: readonly string[], trackerId?: string): Promise<MatchDetailResponse>;
}
