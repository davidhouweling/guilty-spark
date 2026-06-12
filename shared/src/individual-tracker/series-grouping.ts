import { collapseSequentialSeriesEntries } from "../halo/match-enrichment";

function toNextOddNumber(value: number): number {
  return value % 2 === 0 ? value + 1 : value;
}

function inferBestOfFromSeriesRecord(logicalGameCount: number, wins: number, losses: number): number {
  const minimumPossibleSeriesLength = Math.max(logicalGameCount, wins * 2 - 1, losses * 2 - 1, 1);
  return toNextOddNumber(minimumPossibleSeriesLength);
}

export function normalizeSeriesGroupMatchIds(matchIds: readonly string[]): string[] {
  return Array.from(new Set(matchIds)).sort((left, right) => left.localeCompare(right));
}

export function buildSeriesGroupKey(matchIds: readonly string[]): string {
  return normalizeSeriesGroupMatchIds(matchIds).join(":");
}

export function getDefaultSeriesGroupTitle(): string {
  return "Eagle vs Cobra";
}

export function getSeriesGroupTitleFromTeams(teams: readonly { readonly name: string }[]): string | null {
  const [team0, team1] = teams;
  if (team0 == null || team1 == null) {
    return null;
  }
  const name0 = team0.name.trim();
  const name1 = team1.name.trim();
  if (!name0 || !name1) {
    return null;
  }
  return `${name0} vs ${name1}`;
}

export function getDefaultSeriesGroupSubtitle(
  entries: readonly {
    startTime: string;
    mapAssetId: string;
    mapVersionId: string;
    gameVariantCategory: number;
    outcome: string;
  }[],
): string {
  const logicalEntries = collapseSequentialSeriesEntries(entries);
  const logicalGameCount = logicalEntries.length;
  let wins = 0;
  let losses = 0;

  for (const entry of logicalEntries) {
    if (entry.outcome === "Win") {
      wins += 1;
    }

    if (entry.outcome === "Loss") {
      losses += 1;
    }
  }

  return `Best of ${inferBestOfFromSeriesRecord(logicalGameCount, wins, losses).toString()}`;
}
