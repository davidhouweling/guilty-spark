import React, { useEffect, useMemo, useState } from "react";
import { Button } from "../../button/button";
import { Input } from "../../input/input";
import { RankIcon } from "../../icons/rank-icon";
import { MatchHistory } from "../../match-history/match-history";
import { Dialog } from "../../dialog/dialog";
import type {
  TrackerMatchHistoryEntry,
  TrackerMatchHistoryResponse,
  TrackerSearchResult,
} from "../../../services/individual-tracker/types";
import { Alert } from "../../alert/alert";
import { applyAddToAdjacentGroup, applyBreakFromGroup } from "../grouping-utils";
import styles from "./add-tracker-dialog.module.css";

interface AddTrackerDialogProps {
  readonly isOpen: boolean;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSearchGamertag: (query: string) => Promise<TrackerSearchResult | null>;
  readonly onLoadMatches: (xuid: string, start: number, count: number) => Promise<TrackerMatchHistoryResponse>;
  readonly onStartTracker: (payload: { gamertag: string; selectedMatchIds: readonly string[] }) => Promise<void>;
}

function formatCsr(value: string | null): string {
  if (value === null || value === "-") {
    return "-";
  }

  const numValue = parseInt(value, 10);
  if (Number.isNaN(numValue)) {
    return value;
  }

  return new Intl.NumberFormat().format(numValue);
}

function formatMatchCount(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat().format(value);
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
    }
  }, [isOpen]);

  const canStart = useMemo(() => result != null && !busy, [busy, result]);
  const selectedMatchIdSet = useMemo(() => new Set(selectedMatchIds), [selectedMatchIds]);

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
                void onStartTracker({ gamertag: result.gamertag, selectedMatchIds });
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

        {result != null && (
          <div className={styles.previewCard}>
            <p className={styles.previewMeta}>
              <span className={styles.statLine}>
                <span className={styles.statItem}>
                  <span className={styles.statLabel}>Current rank:</span>
                  <RankIcon
                    rankTier={result.currentRankTier}
                    subTier={result.currentRankSubTier}
                    measurementMatchesRemaining={result.currentRankMeasurementMatchesRemaining}
                    initialMeasurementMatches={result.currentRankInitialMeasurementMatches}
                    size="small"
                  />
                  <span className={styles.statValue}>{formatCsr(result.csrLabel)}</span>
                </span>
                <span className={styles.statItem}>
                  <span className={styles.statLabel}>Season peak:</span>
                  <RankIcon
                    rankTier={result.seasonPeakRankTier}
                    subTier={result.seasonPeakRankSubTier}
                    measurementMatchesRemaining={null}
                    initialMeasurementMatches={null}
                    size="small"
                  />
                  <span className={styles.statValue}>{formatCsr(result.seasonPeakCsrLabel)}</span>
                  <span className={styles.statItem}>
                    <span className={styles.statLabel}>All time peak:</span>
                    <RankIcon
                      rankTier={result.allTimePeakRankTier}
                      subTier={result.allTimePeakRankSubTier}
                      measurementMatchesRemaining={null}
                      initialMeasurementMatches={null}
                      size="small"
                    />
                    <span className={styles.statValue}>{formatCsr(result.allTimePeakCsrLabel)}</span>
                  </span>
                </span>
              </span>
            </p>
            <p className={styles.previewMeta}>
              <span className={styles.statLine}>
                <span className={styles.statItem}>
                  <span className={styles.statLabel}>Matchmaking games:</span>
                  <span className={styles.statValue}>{formatMatchCount(result.matchmadeMatchCount)}</span>
                </span>
                <span className={styles.statItem}>
                  <span className={styles.statLabel}>Custom games:</span>
                  <span className={styles.statValue}>{formatMatchCount(result.customMatchCount)}</span>
                </span>
              </span>
            </p>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>2. Add past games</h3>
        <p className={styles.sectionDescription}>Optional — you can skip this section if you want a clean start.</p>

        {result == null ? (
          <p className={styles.mutedText}>Search for a gamertag first to load recent matches.</p>
        ) : (
          <MatchHistory
            entries={loadingMatches && matches.length === 0 ? null : matches}
            loadingCount={3}
            showGroupings={true}
            allowManualGrouping={true}
            groupings={activeGroupings}
            allowSelection={true}
            selectedMatchIds={selectedMatchIdSet}
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
          />
        )}
      </section>
    </Dialog>
  );
}
