import React, { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { TrackerMatchHistoryEntry } from "../../services/individual-tracker/types";
import type { IndividualTrackerSeriesGroup } from "../individual-tracker/series-group-metadata";
import { MatchHistoryPresenter } from "./match-history-presenter";
import { MatchHistoryStore } from "./match-history-store";
import { MatchHistory } from "./match-history";

interface MatchHistorySectionProps {
  readonly entries: readonly TrackerMatchHistoryEntry[] | null;
  readonly loadingCount?: number;
  readonly showGroupings?: boolean;
  readonly allowManualGrouping?: boolean;
  readonly allowSelection?: boolean;
  readonly showActionBar?: boolean;
  readonly selectedMatchIds?: ReadonlySet<string>;
  readonly groupings?: readonly (readonly string[])[];
  readonly hasMore?: boolean;
  readonly seriesGroups?: readonly IndividualTrackerSeriesGroup[];
  readonly onMatchToggle?: (matchId: string) => void;
  readonly onLoadMore?: () => Promise<void>;
  readonly onAddToAboveGroup?: (matchId: string) => void;
  readonly onAddToBelowGroup?: (matchId: string) => void;
  readonly onBreakFromGroup?: (matchId: string) => void;
  readonly onStartTracker?: () => void;
  readonly onSeriesGroupTitleChange?: (groupIndex: number, value: string | null) => void;
  readonly onSeriesGroupSubtitleChange?: (groupIndex: number, value: string | null) => void;
}

export function MatchHistorySection({
  entries,
  loadingCount,
  showGroupings = false,
  allowManualGrouping,
  allowSelection,
  showActionBar,
  selectedMatchIds,
  groupings,
  hasMore,
  seriesGroups,
  onMatchToggle,
  onLoadMore,
  onAddToAboveGroup,
  onAddToBelowGroup,
  onBreakFromGroup,
  onStartTracker,
  onSeriesGroupTitleChange,
  onSeriesGroupSubtitleChange,
}: MatchHistorySectionProps): React.JSX.Element {
  const store = useMemo(() => new MatchHistoryStore(), []);
  const presenter = useMemo(() => new MatchHistoryPresenter({ store, onLoadMore }), [store, onLoadMore]);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (onLoadMore == null || hasMore !== true) {
      return;
    }

    const sentinel = sentinelRef.current;
    if (sentinel == null) {
      return;
    }

    const observer = new IntersectionObserver(
      (intersectionEntries) => {
        const [first] = intersectionEntries;
        if (first.isIntersecting && !store.getSnapshot().isLoadingMore) {
          void presenter.loadMore();
        }
      },
      { rootMargin: "0px 0px 150px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return (): void => {
      observer.disconnect();
    };
  }, [presenter, store, onLoadMore, hasMore]);

  const snapshot = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );

  const model = useMemo(
    () => MatchHistoryPresenter.present(snapshot, entries, groupings, showGroupings, seriesGroups),
    [snapshot, entries, groupings, showGroupings, seriesGroups],
  );

  return (
    <MatchHistory
      entries={entries}
      loadingCount={loadingCount}
      showGroupings={showGroupings}
      allowManualGrouping={allowManualGrouping}
      allowSelection={allowSelection}
      showActionBar={showActionBar}
      selectedMatchIds={selectedMatchIds}
      groupings={groupings}
      hasMore={hasMore}
      seriesGroups={seriesGroups}
      onMatchToggle={onMatchToggle}
      onLoadMore={onLoadMore}
      onAddToAboveGroup={onAddToAboveGroup}
      onAddToBelowGroup={onAddToBelowGroup}
      onBreakFromGroup={onBreakFromGroup}
      onStartTracker={onStartTracker}
      onSeriesGroupTitleChange={onSeriesGroupTitleChange}
      onSeriesGroupSubtitleChange={onSeriesGroupSubtitleChange}
      model={model}
      sentinelRef={sentinelRef}
    />
  );
}
