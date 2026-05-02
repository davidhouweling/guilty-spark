import React, { useEffect, useState } from "react";
import { Alert } from "../../alert/alert";
import { Button } from "../../button/button";
import { Checkbox } from "../../checkbox/checkbox";
import { Dialog } from "../../dialog/dialog";
import { MatchHistory } from "../../match-history/match-history";
import type { TrackerMatchHistoryEntry, TrackerMatchHistoryResponse } from "../../../services/individual-tracker/types";
import { applyAddToAdjacentGroup, applyBreakFromGroup } from "../grouping-utils";
import { shouldHideShortDurationMatch } from "../match-duration-filter";
import styles from "./game-selection-dialog.module.css";

interface GameSelectionDialogProps {
  readonly isOpen: boolean;
  readonly busy: boolean;
  readonly trackerLabel: string;
  readonly trackerId: string;
  readonly xuid: string;
  readonly initialSelectedMatchIds: readonly string[];
  readonly initialGroupings: readonly (readonly string[])[];
  readonly onClose: () => void;
  readonly onLoadEnrichedMatches: (xuid: string, start: number, count: number) => Promise<TrackerMatchHistoryResponse>;
  readonly onSync: (payload: {
    trackerId: string;
    selectedMatchIds: readonly string[];
    matchGroupings: readonly (readonly string[])[];
    matches: readonly TrackerMatchHistoryEntry[];
  }) => Promise<void>;
}

export function GameSelectionDialog({
  isOpen,
  busy,
  trackerLabel,
  trackerId,
  xuid,
  initialSelectedMatchIds,
  initialGroupings,
  onClose,
  onLoadEnrichedMatches,
  onSync,
}: GameSelectionDialogProps): React.ReactElement | null {
  const [enrichedMatches, setEnrichedMatches] = useState<TrackerMatchHistoryResponse | null>(null);
  const [activeGroupings, setActiveGroupings] = useState<readonly (readonly string[])[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selectedMatchIds, setSelectedMatchIds] = useState<ReadonlySet<string>>(new Set(initialSelectedMatchIds));
  const [syncing, setSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hideShortGames, setHideShortGames] = useState(true);

  useEffect(() => {
    if (!isOpen) {
      setEnrichedMatches(null);
      setActiveGroupings([]);
      setLoadingMore(false);
      setHasMore(false);
      setSelectedMatchIds(new Set());
      setSyncing(false);
      setErrorMessage(null);
      setHideShortGames(true);
      return;
    }

    setSelectedMatchIds(new Set(initialSelectedMatchIds));
    setActiveGroupings(initialGroupings.map((group) => [...group]));
    setErrorMessage(null);

    void onLoadEnrichedMatches(xuid, 0, 25)
      .then((response) => {
        setEnrichedMatches(response);
        setActiveGroupings((current) => (current.length > 0 ? current : [...response.suggestedGroupings]));
        setHasMore(response.matches.length >= 25);
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load matches.");
      });
  }, [initialSelectedMatchIds, isOpen, onLoadEnrichedMatches, xuid]);

  const closeAndSync = async (): Promise<void> => {
    if (syncing || busy) {
      return;
    }

    setSyncing(true);
    setErrorMessage(null);

    try {
      await onSync({
        trackerId,
        selectedMatchIds: Array.from(selectedMatchIds),
        matchGroupings: activeGroupings,
        matches: enrichedMatches?.matches ?? [],
      });
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to sync game selection.");
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  const visibleMatches =
    enrichedMatches == null
      ? null
      : hideShortGames
        ? enrichedMatches.matches.filter((entry) => !shouldHideShortDurationMatch(entry))
        : enrichedMatches.matches;

  const loadMore = async (): Promise<void> => {
    if (loadingMore || enrichedMatches == null) {
      return;
    }

    setLoadingMore(true);
    try {
      const response = await onLoadEnrichedMatches(xuid, enrichedMatches.matches.length, 25);
      setEnrichedMatches((prev) =>
        prev == null ? response : { ...response, matches: [...prev.matches, ...response.matches] },
      );
      setHasMore(response.matches.length >= 25);
    } catch {
      // Keep existing data visible.
    } finally {
      setLoadingMore(false);
    }
  };

  const isInteractionDisabled = busy || syncing;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={(): void => void closeAndSync()}
      title="Game Selection"
      titleId="game-selection-title"
      busy={isInteractionDisabled}
      footer={
        <Button onClick={(): void => void closeAndSync()} disabled={isInteractionDisabled}>
          {syncing ? "Syncing..." : "Close and sync"}
        </Button>
      }
    >
      <div className={styles.controlsRow}>
        <p className={styles.summaryText}>
          {trackerLabel} | {selectedMatchIds.size} selected
        </p>

        <Checkbox checked={hideShortGames} onChange={setHideShortGames} label="Hide games < 2m duration" />
      </div>

      {errorMessage != null && <Alert variant="error">{errorMessage}</Alert>}

      <div className={styles.matchesContainer}>
        <MatchHistory
          entries={visibleMatches}
          loadingCount={5}
          showGroupings={true}
          allowManualGrouping={true}
          groupings={activeGroupings}
          allowSelection={true}
          selectedMatchIds={selectedMatchIds}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onMatchToggle={(matchId): void => {
            setSelectedMatchIds((prev) => {
              const next = new Set(prev);
              if (next.has(matchId)) {
                next.delete(matchId);
              } else {
                next.add(matchId);
              }
              return next;
            });
          }}
          onBreakFromGroup={(matchId): void => {
            const entries = enrichedMatches?.matches ?? [];
            setActiveGroupings((prev) => applyBreakFromGroup(prev, entries, matchId));
          }}
          onAddToAboveGroup={(matchId): void => {
            const entries = enrichedMatches?.matches ?? [];
            setActiveGroupings((prev) => applyAddToAdjacentGroup(prev, entries, matchId, "above"));
          }}
          onAddToBelowGroup={(matchId): void => {
            const entries = enrichedMatches?.matches ?? [];
            setActiveGroupings((prev) => applyAddToAdjacentGroup(prev, entries, matchId, "below"));
          }}
        />
      </div>
    </Dialog>
  );
}
