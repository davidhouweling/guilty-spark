import React from "react";
import type { IndividualTrackerSeriesGroup } from "../series-group-metadata";
import type { TrackerMatchHistoryEntry, TrackerSearchResult } from "../../../services/individual-tracker/types";
import { Alert } from "../../alert/alert";
import { Heading } from "../../heading/heading";
import { Button } from "../../button/button";
import { Checkbox } from "../../checkbox/checkbox";
import { Dialog } from "../../dialog/dialog";
import { Input } from "../../input/input";
import { createMatchHistorySection } from "../../match-history/create";
import { TrackerSummary } from "../../individual-tracker-manager/tracker-summary/tracker-summary";
import styles from "./add-tracker-dialog.module.css";

interface AddTrackerDialogProps {
  readonly open: boolean;
  readonly busy: boolean;
  readonly query: string;
  readonly searching: boolean;
  readonly searchError: string | null;
  readonly result: TrackerSearchResult | null;
  readonly visibleMatches: readonly TrackerMatchHistoryEntry[] | null;
  readonly activeGroupings: readonly (readonly string[])[];
  readonly loadingMatches: boolean;
  readonly hasMore: boolean;
  readonly selectedMatchIds: ReadonlySet<string>;
  readonly seriesGroups: readonly IndividualTrackerSeriesGroup[];
  readonly hideShortGames: boolean;
  readonly canStart: boolean;
  readonly onClose: () => void;
  readonly onQueryChange: (value: string) => void;
  readonly onSearch: () => void;
  readonly onMatchToggle: (matchId: string) => void;
  readonly onLoadMore: () => Promise<void>;
  readonly onAddToAboveGroup: (matchId: string) => void;
  readonly onAddToBelowGroup: (matchId: string) => void;
  readonly onBreakFromGroup: (matchId: string) => void;
  readonly onHideShortGamesChange: (value: boolean) => void;
  readonly onSeriesGroupTitleChange: (groupIndex: number, value: string | null) => void;
  readonly onSeriesGroupSubtitleChange: (groupIndex: number, value: string | null) => void;
  readonly onStartTracker: () => void;
}

export function AddTrackerDialog({
  open,
  busy,
  query,
  searching,
  searchError,
  result,
  visibleMatches,
  activeGroupings,
  loadingMatches,
  hasMore,
  selectedMatchIds,
  seriesGroups,
  hideShortGames,
  canStart,
  onClose,
  onQueryChange,
  onSearch,
  onMatchToggle,
  onLoadMore,
  onAddToAboveGroup,
  onAddToBelowGroup,
  onBreakFromGroup,
  onHideShortGamesChange,
  onSeriesGroupTitleChange,
  onSeriesGroupSubtitleChange,
  onStartTracker,
}: AddTrackerDialogProps): React.ReactElement | null {
  const MatchHistorySection = React.useMemo(() => createMatchHistorySection(), []);

  return (
    <Dialog
      open={open}
      title="Add Tracker"
      onClose={onClose}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onStartTracker} disabled={!canStart || busy}>
            {busy ? "Starting..." : "Start tracker"}
          </Button>
        </div>
      }
    >
      <section className={styles.section}>
        <Heading tagName="h3">1. Gamertag</Heading>
        <div className={styles.searchRow}>
          <Input
            label="Gamertag"
            value={query}
            placeholder="Search gamertag"
            onChange={(event): void => {
              onQueryChange(event.currentTarget.value);
            }}
          />
          <Button onClick={onSearch} disabled={searching || query.trim() === ""}>
            {searching ? "Searching..." : "Search"}
          </Button>
        </div>

        {searchError != null && <Alert variant="error">{searchError}</Alert>}

        {result != null && <TrackerSummary tracker={result} className={styles.previewCard} />}
      </section>

      <section className={styles.section}>
        <Heading tagName="h3">2. Add past games</Heading>
        <div className={styles.controlsRow}>
          <p className={styles.sectionDescription}>Optional — you can skip this section if you want a clean start.</p>

          {result != null && (
            <Checkbox checked={hideShortGames} onChange={onHideShortGamesChange} label="Hide games < 2m duration" />
          )}
        </div>

        {result == null ? (
          <p className={styles.mutedText}>Search for a gamertag first to load recent matches.</p>
        ) : (
          <MatchHistorySection
            entries={loadingMatches && visibleMatches == null ? null : (visibleMatches ?? [])}
            loadingCount={3}
            showGroupings={true}
            allowManualGrouping={true}
            groupings={activeGroupings}
            allowSelection={true}
            selectedMatchIds={selectedMatchIds}
            seriesGroups={seriesGroups}
            hasMore={hasMore}
            onLoadMore={onLoadMore}
            onMatchToggle={onMatchToggle}
            onBreakFromGroup={onBreakFromGroup}
            onAddToAboveGroup={onAddToAboveGroup}
            onAddToBelowGroup={onAddToBelowGroup}
            onSeriesGroupTitleChange={onSeriesGroupTitleChange}
            onSeriesGroupSubtitleChange={onSeriesGroupSubtitleChange}
          />
        )}
      </section>
    </Dialog>
  );
}
