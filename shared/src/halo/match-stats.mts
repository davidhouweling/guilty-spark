import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "../base/preconditions.mjs";
import { StatsValueSortBy } from "./stat-formatting.mjs";

export function getPlayerXuid(player: Pick<MatchStats["Players"][0], "PlayerId">): string {
  return player.PlayerId.replace(/^xuid\((\d+)\)$/, "$1");
}

export function getTeamPlayersFromMatches(matches: MatchStats[], team: MatchStats["Teams"][0]): MatchStats["Players"] {
  const uniquePlayersMap = new Map<string, MatchStats["Players"][0]>();
  for (const match of matches) {
    for (const player of match.Players) {
      if (!player.ParticipationInfo.PresentAtBeginning) {
        continue;
      }

      if (!uniquePlayersMap.has(player.PlayerId)) {
        uniquePlayersMap.set(player.PlayerId, player);
      }
    }
  }

  return Array.from(uniquePlayersMap.values())
    .filter((player): boolean => player.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId) != null)
    .sort((a, b) => {
      const rankCalc = a.Rank - b.Rank;
      if (rankCalc !== 0) {
        return rankCalc;
      }

      const aStats = Preconditions.checkExists(a.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId));
      const bStats = Preconditions.checkExists(b.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId));

      const scoreCalc = bStats.Stats.CoreStats.Score - aStats.Stats.CoreStats.Score;
      if (scoreCalc !== 0) {
        return scoreCalc;
      }

      return bStats.Stats.CoreStats.PersonalScore - aStats.Stats.CoreStats.PersonalScore;
    });
}

interface StatEntry {
  value: number;
  sortBy: StatsValueSortBy;
}

export function getBestStatValues(stats: Map<string | number, Map<string, StatEntry>>): Map<string, number> {
  const bestValues = new Map<string, number>();
  for (const statsCollection of stats.values()) {
    for (const [key, entry] of statsCollection.entries()) {
      const previousBestValue = bestValues.get(key);

      if (previousBestValue == null) {
        bestValues.set(key, entry.value);
        continue;
      }

      bestValues.set(
        key,
        entry.sortBy === StatsValueSortBy.ASC
          ? Math.min(previousBestValue, entry.value)
          : Math.max(previousBestValue, entry.value),
      );
    }
  }
  return bestValues;
}

export function getBestTeamStatValues(
  playersStats: Map<string, Map<string, StatEntry>>,
  teamPlayers: MatchStats["Players"],
): Map<string, number> {
  const teamPlayersStats = new Map<string, Map<string, StatEntry>>();
  for (const teamPlayer of teamPlayers) {
    const playerStats = Preconditions.checkExists(playersStats.get(teamPlayer.PlayerId));
    teamPlayersStats.set(teamPlayer.PlayerId, playerStats);
  }
  return getBestStatValues(teamPlayersStats);
}
