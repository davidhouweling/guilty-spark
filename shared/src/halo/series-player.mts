import type { MatchStats, Stats } from "halo-infinite-api";
import { Preconditions } from "../base/preconditions.mjs";
import { adjustAveragesInCoreStats, mergeCoreStats } from "./series-core-stats.mjs";
import { getTeamPlayersFromMatches } from "./match-stats.mjs";

export function getPlayerMatches(matches: MatchStats[]): Map<string, MatchStats[]> {
  const playerMatches = new Map<string, MatchStats[]>();
  for (const match of matches) {
    for (const player of match.Players) {
      if (!player.ParticipationInfo.PresentAtBeginning) {
        continue;
      }

      const pm = playerMatches.get(player.PlayerId) ?? [];
      pm.push(match);
      playerMatches.set(player.PlayerId, pm);
    }
  }

  return playerMatches;
}

export function aggregatePlayerCoreStats(matches: MatchStats[]): Map<string, Stats["CoreStats"]> {
  const playerCoreStats = new Map<string, Stats["CoreStats"]>();
  for (const match of matches) {
    for (const player of match.Players) {
      if (!player.ParticipationInfo.PresentAtBeginning) {
        continue;
      }

      const { PlayerId } = player;
      const playerTeamStats = Preconditions.checkExists(player.PlayerTeamStats[0]);
      const { CoreStats } = playerTeamStats.Stats;

      if (!playerCoreStats.has(PlayerId)) {
        playerCoreStats.set(PlayerId, CoreStats);
        continue;
      }

      const mergedStats = mergeCoreStats(Preconditions.checkExists(playerCoreStats.get(PlayerId)), CoreStats);
      playerCoreStats.set(PlayerId, mergedStats);
    }
  }

  // adjust some of the values which should be averages rather than sums
  for (const [playerId, stats] of playerCoreStats.entries()) {
    playerCoreStats.set(playerId, adjustAveragesInCoreStats(stats, matches.length));
  }

  return playerCoreStats;
}

export function getSeriesTeamPlayersFromMatches(
  matches: MatchStats[],
  team: MatchStats["Teams"][0],
  playersCoreStats: Map<string, Stats["CoreStats"]>,
): MatchStats["Players"] {
  return getTeamPlayersFromMatches(matches, team).sort(
    (a, b) =>
      Preconditions.checkExists(playersCoreStats.get(b.PlayerId)).PersonalScore -
      Preconditions.checkExists(playersCoreStats.get(a.PlayerId)).PersonalScore,
  );
}
