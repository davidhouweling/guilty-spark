import {
  buildSeriesGroupKey,
  normalizeSeriesGroupMatchIds,
  getDefaultSeriesGroupSubtitle as sharedGetDefaultSeriesGroupSubtitle,
} from "@guilty-spark/shared/individual-tracker/series-grouping";
import type { TrackerMatchHistoryEntry } from "../../services/individual-tracker/types";

export interface IndividualTrackerSeriesGroup {
  readonly matchIds: readonly string[];
  readonly titleOverride: string | null;
  readonly subtitleOverride: string | null;
}

export function getDefaultSeriesGroupSubtitle(
  entries: readonly Pick<
    TrackerMatchHistoryEntry,
    "startTimeIso" | "startTime" | "mapAssetId" | "mapVersionId" | "gameVariantCategory" | "outcome"
  >[],
): string {
  return sharedGetDefaultSeriesGroupSubtitle(
    entries.map((entry) => ({
      startTime: entry.startTimeIso ?? entry.startTime,
      mapAssetId: entry.mapAssetId,
      mapVersionId: entry.mapVersionId,
      gameVariantCategory: entry.gameVariantCategory,
      outcome: entry.outcome,
    })),
  );
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
