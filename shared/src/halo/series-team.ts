import type { MatchStats, Stats } from "halo-infinite-api";
import { Preconditions } from "../base/preconditions";
import { adjustAveragesInCoreStats, mergeCoreStats } from "./series-core-stats";
import { buildPresentAtBeginningTeamRosters, resolveMatchTeamIdToSeriesTeamId } from "./series-team-identity";

export function aggregateTeamCoreStats(matches: MatchStats[]): Map<number, Stats["CoreStats"]> {
  const teamCoreStats = new Map<number, Stats["CoreStats"]>();
  const [anchorMatch] = matches;
  const anchorRosters = anchorMatch ? buildPresentAtBeginningTeamRosters(anchorMatch) : null;

  for (const match of matches) {
    const matchTeamIdToSeriesTeamId = resolveMatchTeamIdToSeriesTeamId(anchorRosters, match);

    for (const team of match.Teams) {
      const { TeamId } = team;
      const seriesTeamId = matchTeamIdToSeriesTeamId?.get(TeamId) ?? TeamId;
      const { CoreStats } = team.Stats;
      if (!teamCoreStats.has(seriesTeamId)) {
        teamCoreStats.set(seriesTeamId, CoreStats);
        continue;
      }

      const mergedStats = mergeCoreStats(Preconditions.checkExists(teamCoreStats.get(seriesTeamId)), CoreStats);
      teamCoreStats.set(seriesTeamId, mergedStats);
    }
  }

  // adjust some of the values which should be averages rather than sums
  for (const [teamId, stats] of teamCoreStats.entries()) {
    teamCoreStats.set(teamId, adjustAveragesInCoreStats(stats, matches.length));
  }

  return teamCoreStats;
}
