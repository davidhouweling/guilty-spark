import React from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { getDefaultSeriesGroupTitle } from "@guilty-spark/shared/individual-tracker/series-grouping";
import { Heading } from "../heading/heading";
import type { TrackerMatchHistoryEntry } from "../../services/individual-tracker/types";
import type { IndividualTrackerSeriesGroup } from "../individual-tracker/series-group-metadata";
import { getDefaultSeriesGroupSubtitle } from "../individual-tracker/series-group-metadata";
import { Alert } from "../alert/alert";
import { Button } from "../button/button";
import { Input } from "../input/input";
import { LoadingState } from "../loading-state/loading-state";
import { MatchCard } from "../match-card/match-card";
import type { MatchHistoryModel } from "./match-history-presenter";
import styles from "./match-history.module.css";

export interface MatchHistoryProps {
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
  readonly model: MatchHistoryModel;
}

export function MatchHistory({
  entries,
  loadingCount = 3,
  allowManualGrouping = false,
  allowSelection = false,
  showActionBar = false,
  selectedMatchIds,
  groupings,
  showGroupings = false,
  hasMore,
  onMatchToggle,
  onLoadMore,
  onAddToAboveGroup,
  onAddToBelowGroup,
  onBreakFromGroup,
  onStartTracker,
  onSeriesGroupTitleChange,
  onSeriesGroupSubtitleChange,
  model,
}: MatchHistoryProps): React.JSX.Element {
  const isGroupableGame = (entry: TrackerMatchHistoryEntry): boolean =>
    entry.category === "custom" || entry.category === "local";

  const showSeriesInfo = showGroupings && (groupings?.length ?? 0) > 0;

  const entryIndexMap = new Map<string, number>();
  if (entries != null) {
    for (const [index, entry] of entries.entries()) {
      entryIndexMap.set(entry.matchId, index);
    }
  }

  if (entries === null) {
    return (
      <div className={styles.loadingList}>
        {Array.from({ length: loadingCount }).map((_, index) => (
          <LoadingState key={index} />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return <Alert variant="info">No matches found</Alert>;
  }

  return (
    <div className={styles.container}>
      {showSeriesInfo && groupings != null && (
        <Alert variant="info">
          Suggested <strong>{groupings.length}</strong> game series from <strong>{entries.length}</strong> matches
        </Alert>
      )}

      {showActionBar && onStartTracker != null && (
        <div className={styles.actionBar}>
          <Button variant="primary" onClick={onStartTracker}>
            Start Tracker
          </Button>
        </div>
      )}

      <div className={styles.matchList}>
        {model.segmentBlocks.map((segment) => {
          switch (segment.type) {
            case "single": {
              const entryIndex = entryIndexMap.get(segment.entry.matchId);
              const aboveEntry = entryIndex != null && entryIndex > 0 ? entries[entryIndex - 1] : undefined;
              const belowEntry =
                entryIndex != null && entryIndex < entries.length - 1 ? entries[entryIndex + 1] : undefined;
              const isGroupable = isGroupableGame(segment.entry);
              const canAddToAbove =
                allowManualGrouping && isGroupable && aboveEntry != null && isGroupableGame(aboveEntry);
              const canAddToBelow =
                allowManualGrouping && isGroupable && belowEntry != null && isGroupableGame(belowEntry);
              const isSelected = selectedMatchIds?.has(segment.entry.matchId) ?? false;
              return (
                <MatchCard
                  key={segment.entry.matchId}
                  entry={segment.entry}
                  isSelected={isSelected}
                  showGrouping={false}
                  canAddToAbove={canAddToAbove}
                  canAddToBelow={canAddToBelow}
                  canBreakFromGroup={false}
                  allowSelection={allowSelection}
                  onToggle={() => {
                    onMatchToggle?.(segment.entry.matchId);
                  }}
                  onAddToAbove={() => {
                    onAddToAboveGroup?.(segment.entry.matchId);
                  }}
                  onAddToBelow={() => {
                    onAddToBelowGroup?.(segment.entry.matchId);
                  }}
                />
              );
            }

            case "group": {
              const groupMatchIds = segment.entries.map(({ entry }) => entry.matchId);
              const isSeriesSelected =
                allowSelection && selectedMatchIds != null && groupMatchIds.every((id) => selectedMatchIds.has(id));
              const groupStyle = { "--group-color": segment.color } as React.CSSProperties;

              const handleSeriesToggle = (): void => {
                if (onMatchToggle == null) {
                  return;
                }
                const allSelected = groupMatchIds.every((id) => selectedMatchIds?.has(id) ?? false);
                for (const matchId of groupMatchIds) {
                  const isCurrent = selectedMatchIds?.has(matchId) ?? false;
                  if (allSelected ? isCurrent : !isCurrent) {
                    onMatchToggle(matchId);
                  }
                }
              };

              return (
                <section key={`group-${String(segment.groupIndex)}`} className={styles.seriesBlock} style={groupStyle}>
                  <div className={styles.seriesHeader}>
                    <div className={styles.seriesHeaderTopRow}>
                      <Heading tagName="h3" className={styles.seriesTitle}>
                        {segment.seriesGroup?.titleOverride ?? getDefaultSeriesGroupTitle()}
                      </Heading>
                      <p className={styles.seriesGameCount}>{groupMatchIds.length} games</p>
                    </div>
                    <div className={styles.seriesLabelOptions}>
                      <Input
                        label={`Series ${(segment.groupIndex + 1).toString()} title`}
                        value={segment.seriesGroup?.titleOverride ?? ""}
                        placeholder={getDefaultSeriesGroupTitle()}
                        onChange={(event): void => {
                          onSeriesGroupTitleChange?.(
                            segment.groupIndex,
                            event.currentTarget.value === "" ? null : event.currentTarget.value,
                          );
                        }}
                      />
                      <Input
                        label={`Series ${(segment.groupIndex + 1).toString()} subtitle`}
                        value={segment.seriesGroup?.subtitleOverride ?? ""}
                        placeholder={getDefaultSeriesGroupSubtitle(segment.entries.map(({ entry }) => entry))}
                        onChange={(event): void => {
                          onSeriesGroupSubtitleChange?.(
                            segment.groupIndex,
                            event.currentTarget.value === "" ? null : event.currentTarget.value,
                          );
                        }}
                      />
                    </div>
                    {allowSelection && onMatchToggle != null && (
                      <div className={styles.seriesActionRow}>
                        <Button variant="secondary" size="small" onClick={handleSeriesToggle}>
                          {isSeriesSelected ? "Deselect matches in series" : "Select all matches in series"}
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className={styles.seriesCards}>
                    {segment.entries.map(({ entry }, segmentIndex) => {
                      const isGroupStart = segmentIndex === 0;
                      const isGroupEnd = segmentIndex === segment.entries.length - 1;
                      const isSelected = selectedMatchIds?.has(entry.matchId) ?? false;
                      const entryIndex = entryIndexMap.get(entry.matchId);
                      const aboveEntry = entryIndex != null && entryIndex > 0 ? entries[entryIndex - 1] : undefined;
                      const belowEntry =
                        entryIndex != null && entryIndex < entries.length - 1 ? entries[entryIndex + 1] : undefined;
                      const isGroupable = isGroupableGame(entry);
                      const canBreakFromGroup = isGroupable;
                      const canAddToAbove =
                        isGroupable && isGroupStart && aboveEntry != null && isGroupableGame(aboveEntry);
                      const canAddToBelow =
                        isGroupable && isGroupEnd && belowEntry != null && isGroupableGame(belowEntry);

                      return (
                        <MatchCard
                          key={entry.matchId}
                          entry={entry}
                          isSelected={isSelected}
                          isGroupStart={isGroupStart}
                          isGroupEnd={isGroupEnd}
                          groupColor={segment.color}
                          showGrouping={true}
                          canAddToAbove={allowManualGrouping && canAddToAbove}
                          canAddToBelow={allowManualGrouping && canAddToBelow}
                          canBreakFromGroup={allowManualGrouping && canBreakFromGroup}
                          allowSelection={allowSelection}
                          onToggle={() => {
                            onMatchToggle?.(entry.matchId);
                          }}
                          onAddToAbove={() => {
                            onAddToAboveGroup?.(entry.matchId);
                          }}
                          onAddToBelow={() => {
                            onAddToBelowGroup?.(entry.matchId);
                          }}
                          onBreakFromGroup={() => {
                            onBreakFromGroup?.(entry.matchId);
                          }}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            }

            default: {
              throw new UnreachableError(segment);
            }
          }
        })}
        {hasMore === true && (
          <div className={styles.loadMoreRow}>
            <Button
              variant="secondary"
              loading={model.isLoadingMore}
              disabled={model.isLoadingMore}
              onClick={() => {
                void onLoadMore?.();
              }}
            >
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
