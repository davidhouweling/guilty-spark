import React from "react";
import type { IndividualTrackerSeriesGroup } from "../series-group-metadata";
import type { TrackerMatchHistoryEntry } from "../../../services/individual-tracker/types";
import { Alert } from "../../alert/alert";
import { Button } from "../../button/button";
import { Checkbox } from "../../checkbox/checkbox";
import { Dialog } from "../../dialog/dialog";
import { LoadingState } from "../../loading-state/loading-state";
import { MatchHistorySection } from "../../match-history/create";
import styles from "./game-selection-dialog.module.css";

export interface GameSelectionDialogProps {
  readonly isOpen: boolean;
  readonly trackerLabel: string;
  readonly selectedCount: number;
  readonly isSyncing: boolean;
  readonly errorMessage: string | null;
  readonly visibleMatches: readonly TrackerMatchHistoryEntry[] | null;
  readonly groupings: readonly (readonly string[])[];
  readonly seriesGroups: readonly IndividualTrackerSeriesGroup[];
  readonly selectedMatchIds: ReadonlySet<string>;
  readonly hasMore: boolean;
  readonly hideShortGames: boolean;
  readonly onClose: () => void;
  readonly onSyncAndClose: () => void;
  readonly onMatchToggle: (matchId: string) => void;
  readonly onBreakFromGroup: (matchId: string) => void;
  readonly onAddToAboveGroup: (matchId: string) => void;
  readonly onAddToBelowGroup: (matchId: string) => void;
  readonly onSeriesGroupTitleChange: (groupIndex: number, value: string | null) => void;
  readonly onSeriesGroupSubtitleChange: (groupIndex: number, value: string | null) => void;
  readonly onHideShortGamesChange: (hide: boolean) => void;
  readonly onLoadMore: () => void;
}

export function GameSelectionDialog({
  isOpen,
  trackerLabel,
  selectedCount,
  isSyncing,
  errorMessage,
  visibleMatches,
  groupings,
  seriesGroups,
  selectedMatchIds,
  hasMore,
  hideShortGames,
  onClose,
  onSyncAndClose,
  onMatchToggle,
  onBreakFromGroup,
  onAddToAboveGroup,
  onAddToBelowGroup,
  onSeriesGroupTitleChange,
  onSeriesGroupSubtitleChange,
  onHideShortGamesChange,
  onLoadMore,
}: GameSelectionDialogProps): React.ReactElement | null {
  if (!isOpen) {
    return null;
  }

  const handleLoadMore = async (): Promise<void> => {
    onLoadMore();
    return Promise.resolve();
  };

  return (
    <Dialog
      open={isOpen}
      title="Game Selection"
      onClose={onClose}
      panelClassName={styles.dialogPanel}
      bodyClassName={styles.dialogBody}
    >
      <div className={styles.controlsRow}>
        <p className={styles.summaryText}>
          {trackerLabel} | {selectedCount} selected
        </p>
        <Checkbox checked={hideShortGames} onChange={onHideShortGamesChange} label="Hide games < 2m duration" />
      </div>

      {errorMessage != null && <Alert variant="error">{errorMessage}</Alert>}

      {errorMessage == null && visibleMatches == null ? (
        <div className={styles.matchesContainer}>
          <LoadingState text="Loading matches..." />
        </div>
      ) : null}

      {(errorMessage == null || visibleMatches !== null) && visibleMatches != null && (
        <div className={styles.matchesContainer}>
          <MatchHistorySection
            entries={visibleMatches}
            showGroupings={true}
            allowManualGrouping={true}
            groupings={groupings}
            allowSelection={true}
            selectedMatchIds={selectedMatchIds}
            seriesGroups={seriesGroups}
            hasMore={hasMore}
            onLoadMore={handleLoadMore}
            onMatchToggle={onMatchToggle}
            onBreakFromGroup={onBreakFromGroup}
            onAddToAboveGroup={onAddToAboveGroup}
            onAddToBelowGroup={onAddToBelowGroup}
            onSeriesGroupTitleChange={onSeriesGroupTitleChange}
            onSeriesGroupSubtitleChange={onSeriesGroupSubtitleChange}
          />
        </div>
      )}

      <Button onClick={onSyncAndClose} disabled={isSyncing}>
        {isSyncing ? "Syncing..." : "Close and sync"}
      </Button>
    </Dialog>
  );
}
