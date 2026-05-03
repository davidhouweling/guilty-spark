import type { IndividualTrackerSeriesGroup } from "@guilty-spark/shared/individual-tracker/types";
import { collapseSequentialSeriesEntries } from "@guilty-spark/shared/halo/match-enrichment";
import type { TrackerMatchHistoryEntry } from "../../services/individual-tracker/types";

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

export function getDefaultSeriesGroupSubtitle(
  entries: readonly Pick<
    TrackerMatchHistoryEntry,
    "startTimeIso" | "startTime" | "mapAssetId" | "mapVersionId" | "gameVariantCategory" | "outcome"
  >[],
): string {
  const logicalEntries = collapseSequentialSeriesEntries(
    entries.map((entry) => ({
      startTime: entry.startTimeIso ?? entry.startTime,
      mapAssetId: entry.mapAssetId,
      mapVersionId: entry.mapVersionId,
      gameVariantCategory: entry.gameVariantCategory,
      outcome: entry.outcome,
    })),
  );
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

export function alignSeriesGroupsToGroupings(
  groupings: readonly (readonly string[])[],
  seriesGroups: readonly IndividualTrackerSeriesGroup[],
): IndividualTrackerSeriesGroup[] {
  const existingGroupsByKey = new Map(seriesGroups.map((group) => [buildSeriesGroupKey(group.matchIds), group]));

  return groupings
    .filter((group) => group.length >= 2)
    .map((group) => {
      const normalizedMatchIds = normalizeSeriesGroupMatchIds(group);
      const existingGroup = existingGroupsByKey.get(buildSeriesGroupKey(normalizedMatchIds));

      return {
        matchIds: normalizedMatchIds,
        titleOverride: existingGroup?.titleOverride ?? null,
        subtitleOverride: existingGroup?.subtitleOverride ?? null,
      } satisfies IndividualTrackerSeriesGroup;
    });
}
