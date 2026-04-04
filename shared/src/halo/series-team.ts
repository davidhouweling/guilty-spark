import type { MatchStats, Stats } from "halo-infinite-api";
import { Preconditions } from "../base/preconditions";
import { adjustAveragesInCoreStats, mergeCoreStats } from "./series-core-stats";

export function aggregateTeamCoreStats(matches: MatchStats[]): Map<number, Stats["CoreStats"]> {
  const teamCoreStats = new Map<number, Stats["CoreStats"]>();
  for (const match of matches) {
    for (const team of match.Teams) {
      const { TeamId } = team;
      const { CoreStats } = team.Stats;
      if (!teamCoreStats.has(TeamId)) {
        teamCoreStats.set(TeamId, CoreStats);
        continue;
      }

      const mergedStats = mergeCoreStats(Preconditions.checkExists(teamCoreStats.get(TeamId)), CoreStats);
      teamCoreStats.set(TeamId, mergedStats);
    }
  }

  // adjust some of the values which should be averages rather than sums
  for (const [teamId, stats] of teamCoreStats.entries()) {
    teamCoreStats.set(teamId, adjustAveragesInCoreStats(stats, matches.length));
  }

  return teamCoreStats;
}
