import { MatchOutcome } from "halo-infinite-api";
import { isBefore } from "date-fns";

export interface SeriesScoreEntry {
  readonly startTime: string;
  readonly mapAssetId: string;
  readonly mapVersionId: string;
  readonly gameVariantCategory: number;
  readonly teamOutcomes: readonly number[];
}

export function computeSeriesTeamWins(entries: readonly SeriesScoreEntry[]): number[] {
  const teamScores: Record<number, number> = {};
  const sortedEntries = [...entries].sort((a, b) => (isBefore(a.startTime, b.startTime) ? -1 : 1));
  for (const [index, entry] of sortedEntries.entries()) {
    const nextEntry = sortedEntries[index + 1];
    if (
      nextEntry?.mapAssetId === entry.mapAssetId &&
      nextEntry.mapVersionId === entry.mapVersionId &&
      nextEntry.gameVariantCategory === entry.gameVariantCategory
    ) {
      continue;
    }
    for (const [teamIndex, outcome] of entry.teamOutcomes.entries()) {
      teamScores[teamIndex] = (teamScores[teamIndex] ?? 0) + (outcome === MatchOutcome.Win.valueOf() ? 1 : 0);
    }
  }

  return Object.values(teamScores);
}
