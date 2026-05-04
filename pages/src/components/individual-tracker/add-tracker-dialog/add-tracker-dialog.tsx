import React, { useEffect, useMemo, useState } from "react";
import type { IndividualTrackerSeriesGroup } from "@guilty-spark/shared/individual-tracker/types";
import { Button } from "../../button/button";
import { Checkbox } from "../../checkbox/checkbox";
import { Input } from "../../input/input";
import { MatchHistory } from "../../match-history/match-history";
import { Dialog } from "../../dialog/dialog";
import { TrackerSummary } from "../tracker-summary/tracker-summary";
import type {
  TrackerMatchHistoryEntry,
  TrackerMatchHistoryResponse,
  TrackerSearchResult,
} from "../../../services/individual-tracker/types";
import { Alert } from "../../alert/alert";
import { applyAddToAdjacentGroup, applyBreakFromGroup } from "../grouping-utils";
import { shouldHideShortDurationMatch } from "../match-duration-filter";
import { alignSeriesGroupsToGroupings } from "../series-group-metadata";
import styles from "./add-tracker-dialog.module.css";

interface AddTrackerDialogProps {
  readonly isOpen: boolean;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSearchGamertag: (query: string) => Promise<TrackerSearchResult | null>;
  readonly onLoadMatches: (xuid: string, start: number, count: number) => Promise<TrackerMatchHistoryResponse>;
  readonly onStartTracker: (payload: {
    gamertag: string;
    selectedMatchIds: readonly string[];
    matchGroupings: readonly (readonly string[])[];
    seriesGroups: readonly IndividualTrackerSeriesGroup[];
    matches: readonly TrackerMatchHistoryEntry[];
  }) => Promise<void>;
}

export function AddTrackerDialog({
  isOpen,
  busy,
  onClose,
  onSearchGamertag,
  onLoadMatches,
  onStartTracker,
}: AddTrackerDialogProps): React.ReactElement | null {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackerSearchResult | null>(null);

  const [matches, setMatches] = useState<TrackerMatchHistoryEntry[]>([]);
  const [activeGroupings, setActiveGroupings] = useState<readonly (readonly string[])[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [seriesGroups, setSeriesGroups] = useState<readonly IndividualTrackerSeriesGroup[]>([]);
  const [hideShortGames, setHideShortGames] = useState(true);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSearching(false);
      setSearchError(null);
      setResult(null);
      setMatches([]);
      setActiveGroupings([]);
      setLoadingMatches(false);
      setHasMore(false);
      setSelectedMatchIds([]);
      setSeriesGroups([]);
      setHideShortGames(true);
    }
  }, [isOpen]);

  useEffect(() => {
    setSeriesGroups((current) => alignSeriesGroupsToGroupings(activeGroupings, current));
  }, [activeGroupings]);

  const canStart = useMemo(() => result != null && !busy, [busy, result]);
  const selectedMatchIdSet = useMemo(() => new Set(selectedMatchIds), [selectedMatchIds]);
  const visibleMatches = useMemo(
    () => (hideShortGames ? matches.filter((entry) => !shouldHideShortDurationMatch(entry)) : matches),
    [hideShortGames, matches],
  );

  const search = async (): Promise<void> => {
    const normalized = query.trim();
    if (normalized === "") {
      return;
    }

    setSearching(true);
    setSearchError(null);

    try {
      const found = await onSearchGamertag(normalized);
      if (found == null) {
        setResult(null);
        setMatches([]);
        setSelectedMatchIds([]);
        setSearchError("No matching gamertag found.");
        return;
      }

      setResult(found);

      setLoadingMatches(true);
      const firstResponse = await onLoadMatches(found.xuid, 0, 25);
      setMatches([...firstResponse.matches]);
      setActiveGroupings([...firstResponse.suggestedGroupings]);
      setHasMore(firstResponse.matches.length >= 25);
      setSelectedMatchIds([]);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Failed to search gamertag.");
    } finally {
      setSearching(false);
      setLoadingMatches(false);
    }
  };

  const loadMore = async (): Promise<void> => {
    if (result == null || loadingMatches) {
      return;
    }

    setLoadingMatches(true);
    try {
      const nextResponse = await onLoadMatches(result.xuid, matches.length, 25);
      setMatches((prev) => [...prev, ...nextResponse.matches]);
      setHasMore(nextResponse.matches.length >= 25);
    } catch {
      // Keep existing data visible.
    } finally {
      setLoadingMatches(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Add Tracker"
      titleId="add-tracker-title"
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={(): void => {
              if (result != null) {
                void onStartTracker({
                  gamertag: result.gamertag,
                  selectedMatchIds,
                  matchGroupings: activeGroupings,
                  seriesGroups,
                  matches,
                });
              }
            }}
            disabled={!canStart}
          >
            Start tracker
          </Button>
        </>
      }
    >
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>1. Gamertag</h3>
        <div className={styles.searchRow}>
          <Input
            label="Gamertag"
            value={query}
            placeholder="Search gamertag"
            onChange={(event): void => {
              setQuery(event.currentTarget.value);
            }}
          />
          <Button onClick={(): void => void search()} disabled={searching || query.trim() === ""}>
            {searching ? "Searching..." : "Search"}
          </Button>
        </div>

        {searchError != null && <Alert variant="error">{searchError}</Alert>}

        {result != null && <TrackerSummary tracker={result} className={styles.previewCard} />}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>2. Add past games</h3>
        <div className={styles.controlsRow}>
          <p className={styles.sectionDescription}>Optional — you can skip this section if you want a clean start.</p>

          {result != null && (
            <Checkbox checked={hideShortGames} onChange={setHideShortGames} label="Hide games < 2m duration" />
          )}
        </div>

        {result == null ? (
          <p className={styles.mutedText}>Search for a gamertag first to load recent matches.</p>
        ) : (
          <>
            <MatchHistory
              entries={loadingMatches && matches.length === 0 ? null : visibleMatches}
              loadingCount={3}
              showGroupings={true}
              allowManualGrouping={true}
              groupings={activeGroupings}
              allowSelection={true}
              selectedMatchIds={selectedMatchIdSet}
              seriesGroups={seriesGroups}
              hasMore={hasMore}
              onLoadMore={loadMore}
              onMatchToggle={(matchId): void => {
                setSelectedMatchIds((prev) =>
                  prev.includes(matchId) ? prev.filter((id) => id !== matchId) : [...prev, matchId],
                );
              }}
              onBreakFromGroup={(matchId): void => {
                setActiveGroupings((prev) => applyBreakFromGroup(prev, matches, matchId));
              }}
              onAddToAboveGroup={(matchId): void => {
                setActiveGroupings((prev) => applyAddToAdjacentGroup(prev, matches, matchId, "above"));
              }}
              onAddToBelowGroup={(matchId): void => {
                setActiveGroupings((prev) => applyAddToAdjacentGroup(prev, matches, matchId, "below"));
              }}
              onSeriesGroupTitleChange={(groupIndex, value): void => {
                setSeriesGroups((current) =>
                  current.map((group, index) => (index === groupIndex ? { ...group, titleOverride: value } : group)),
                );
              }}
              onSeriesGroupSubtitleChange={(groupIndex, value): void => {
                setSeriesGroups((current) =>
                  current.map((group, index) => (index === groupIndex ? { ...group, subtitleOverride: value } : group)),
                );
              }}
            />
          </>
        )}
      </section>
    </Dialog>
  );
}
