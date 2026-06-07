import { HALO_TEAM_COLORS } from "../team-colors/team-colors";
import type { TrackerMatchHistoryEntry } from "../../services/individual-tracker/types";
import type { IndividualTrackerSeriesGroup } from "../individual-tracker/series-group-metadata";
import type { MatchHistorySnapshot, MatchHistoryStore } from "./match-history-store";

interface GroupSegmentEntry {
  readonly entry: TrackerMatchHistoryEntry;
}

export interface GroupSegmentBlock {
  readonly type: "group";
  readonly groupIndex: number;
  readonly color: string;
  readonly entries: readonly GroupSegmentEntry[];
  readonly seriesGroup: IndividualTrackerSeriesGroup | undefined;
}

export interface SingleSegmentBlock {
  readonly type: "single";
  readonly entry: TrackerMatchHistoryEntry;
}

export type SegmentBlock = GroupSegmentBlock | SingleSegmentBlock;

export interface MatchHistoryModel {
  readonly segmentBlocks: readonly SegmentBlock[];
  readonly isLoadingMore: boolean;
}

interface MatchHistoryConfig {
  readonly store: MatchHistoryStore;
  readonly onLoadMore: (() => Promise<void>) | undefined;
}

export class MatchHistoryPresenter {
  private readonly config: MatchHistoryConfig;

  public constructor(config: MatchHistoryConfig) {
    this.config = config;
  }

  public async loadMore(): Promise<void> {
    if (this.config.onLoadMore == null) {
      return;
    }
    this.config.store.update({ isLoadingMore: true });
    try {
      await this.config.onLoadMore();
    } finally {
      this.config.store.update({ isLoadingMore: false });
    }
  }

  public static present(
    snapshot: MatchHistorySnapshot,
    entries: readonly TrackerMatchHistoryEntry[] | null,
    groupings: readonly (readonly string[])[] | undefined,
    showGroupings: boolean,
    seriesGroups: readonly IndividualTrackerSeriesGroup[] | undefined,
  ): MatchHistoryModel {
    const segmentBlocks = MatchHistoryPresenter.buildSegmentBlocks(entries, groupings, showGroupings, seriesGroups);
    return { segmentBlocks, isLoadingMore: snapshot.isLoadingMore };
  }

  private static buildSegmentBlocks(
    entries: readonly TrackerMatchHistoryEntry[] | null,
    groupings: readonly (readonly string[])[] | undefined,
    showGroupings: boolean,
    seriesGroups: readonly IndividualTrackerSeriesGroup[] | undefined,
  ): readonly SegmentBlock[] {
    if (entries == null) {
      return [];
    }

    const matchGroupIndexMap = MatchHistoryPresenter.buildMatchGroupIndexMap(groupings);
    const result: SegmentBlock[] = [];
    let i = 0;
    let visibleSeriesIndex = 0;

    while (i < entries.length) {
      const entry = entries[i];
      const groupIndex = matchGroupIndexMap.get(entry.matchId);

      if (showGroupings && groupIndex !== undefined) {
        const groupEntries: GroupSegmentEntry[] = [];
        while (i < entries.length && matchGroupIndexMap.get(entries[i].matchId) === groupIndex) {
          groupEntries.push({ entry: entries[i] });
          i++;
        }
        result.push({
          type: "group",
          groupIndex,
          color: HALO_TEAM_COLORS[visibleSeriesIndex % HALO_TEAM_COLORS.length]?.hex ?? HALO_TEAM_COLORS[0].hex,
          entries: groupEntries,
          seriesGroup: seriesGroups?.[visibleSeriesIndex],
        });
        visibleSeriesIndex += 1;
      } else {
        result.push({ type: "single", entry });
        i++;
      }
    }

    return result;
  }

  private static buildMatchGroupIndexMap(
    groupings: readonly (readonly string[])[] | undefined,
  ): ReadonlyMap<string, number> {
    const map = new Map<string, number>();
    if (groupings != null) {
      for (const [groupIndex, group] of groupings.entries()) {
        for (const matchId of group) {
          map.set(matchId, groupIndex);
        }
      }
    }
    return map;
  }
}
