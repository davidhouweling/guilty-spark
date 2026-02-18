import type { Row } from "@tanstack/react-table";
import type { MatchStatsData, MatchStatsPlayerData, MatchStatsMedal } from "./types";

/**
 * Converts an array of medals into a Map keyed by sorting weight.
 * Multiple medals with the same weight have their counts summed.
 *
 * @param medals Array of medals to convert
 * @returns Map of sorting weight to total count
 */
export function medalsToWeightMap(medals: readonly MatchStatsMedal[]): Map<number, number> {
  const medalMap = new Map<number, number>();
  for (const medal of medals) {
    medalMap.set(medal.sortingWeight, (medalMap.get(medal.sortingWeight) ?? 0) + medal.count);
  }
  return medalMap;
}

/**
 * Accessor function for team medals columns.
 * Aggregates all medals from all players on the team.
 *
 * @param row The team data row
 * @returns Map of sorting weight to total count for the team
 */
export function getTeamMedalsMap(row: MatchStatsData): Map<number, number> {
  const teamMedals = new Map<number, number>();
  for (const player of row.players) {
    for (const medal of player.medals) {
      teamMedals.set(medal.sortingWeight, (teamMedals.get(medal.sortingWeight) ?? 0) + medal.count);
    }
  }
  return teamMedals;
}

/**
 * Accessor function for player medals columns.
 *
 * @param row The player data row
 * @returns Map of sorting weight to count for the player
 */
export function getPlayerMedalsMap(row: { player: MatchStatsPlayerData }): Map<number, number> {
  return medalsToWeightMap(row.player.medals);
}

/**
 * Sorts rows by medals based on their sorting weights and counts.
 * Medals are compared first by weight (higher is better), then by count (higher is better).
 *
 * @param rowA First row to compare
 * @param rowB Second row to compare
 * @param columnId The column ID containing the medals data
 * @returns -1 if rowA < rowB, 1 if rowA > rowB, 0 if equal
 */
export function sortByMedals<TData>(rowA: Row<TData>, rowB: Row<TData>, columnId: string): -1 | 0 | 1 {
  const medalsA = rowA.getValue<Map<number, number>>(columnId);
  const medalsB = rowB.getValue<Map<number, number>>(columnId);

  const sortedWeightsA = Array.from(medalsA.keys()).sort((a, b) => b - a);
  const sortedWeightsB = Array.from(medalsB.keys()).sort((a, b) => b - a);

  if (sortedWeightsA.length === 0 && sortedWeightsB.length === 0) {
    return 0;
  } else if (sortedWeightsA.length === 0) {
    return -1;
  } else if (sortedWeightsB.length === 0) {
    return 1;
  }

  for (const weightA of sortedWeightsA) {
    for (const weightB of sortedWeightsB) {
      if (weightA < weightB) {
        return -1;
      } else if (weightA > weightB) {
        return 1;
      } else {
        const countA = medalsA.get(weightA) ?? 0;
        const countB = medalsB.get(weightB) ?? 0;
        if (countA < countB) {
          return -1;
        } else if (countA > countB) {
          return 1;
        }
      }
    }
  }

  return 0;
}
