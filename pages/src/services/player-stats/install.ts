import { RealPlayerStatsService } from "./player-stats";
import type { PlayerStatsService } from "./player-stats-types";

export function installPlayerStatsService(apiHost: string): PlayerStatsService {
  return new RealPlayerStatsService({ apiHost });
}
