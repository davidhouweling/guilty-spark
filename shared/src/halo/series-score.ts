import { MatchOutcome } from "halo-infinite-api";
import { collapseSequentialSeriesEntries } from "./match-enrichment";

export interface SeriesScoreEntry {
  readonly startTime: string;
  readonly mapAssetId: string;
  readonly mapVersionId: string;
  readonly gameVariantCategory: number;
  readonly teamOutcomes: readonly number[];
}

export function computeSeriesTeamWins(entries: readonly SeriesScoreEntry[]): number[] {
  const teamScores: Record<number, number> = {};
  for (const entry of collapseSequentialSeriesEntries(entries)) {
    for (const [teamIndex, outcome] of entry.teamOutcomes.entries()) {
      teamScores[teamIndex] = (teamScores[teamIndex] ?? 0) + (outcome === MatchOutcome.Win.valueOf() ? 1 : 0);
    }
  }

  return Object.values(teamScores);
}
