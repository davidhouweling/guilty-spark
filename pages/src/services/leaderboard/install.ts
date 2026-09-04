import { getMode } from "../mode";
import { RealLeaderboardService } from "./leaderboard";
import type { LeaderboardService } from "./leaderboard-types";

export async function installLeaderboardService(apiHost: string): Promise<LeaderboardService> {
  if (getMode() === "FAKE") {
    const { aFakeLeaderboardServiceWith } = await import("./fakes/leaderboard.fake");
    return aFakeLeaderboardServiceWith();
  }

  return new RealLeaderboardService({ apiHost });
}
