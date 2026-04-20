import React, { useEffect, useMemo, useState } from "react";
import { Button } from "../button/button";
import { Input } from "../input/input";
import type { TrackerRecentMatch, TrackerSearchResult } from "../../services/individual-live-tracker/types";
import styles from "./add-tracker-dialog.module.css";

interface AddTrackerDialogProps {
  readonly isOpen: boolean;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSearchGamertag: (query: string) => Promise<TrackerSearchResult | null>;
  readonly onLoadMatches: (xuid: string, start: number, count: number) => Promise<readonly TrackerRecentMatch[]>;
  readonly onStartTracker: (payload: { gamertag: string; selectedMatchIds: readonly string[] }) => Promise<void>;
}

function formatMatchLabel(match: TrackerRecentMatch): string {
  const mapPart = match.mapAssetId ?? "Unknown map";
  const modePart = match.modeAssetId ?? "Unknown mode";
  const startPart = match.startTime != null ? new Date(match.startTime).toLocaleString() : "Unknown start";
  return `${startPart} • ${mapPart} • ${modePart}`;
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

  const [matches, setMatches] = useState<TrackerRecentMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSearching(false);
      setSearchError(null);
      setResult(null);
      setMatches([]);
      setLoadingMatches(false);
      setSelectedMatchIds([]);
    }
  }, [isOpen]);

  const canStart = useMemo(() => result != null && !busy, [busy, result]);

  if (!isOpen) {
    return null;
  }

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
      const firstMatches = await onLoadMatches(found.xuid, 0, 25);
      setMatches([...firstMatches]);
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
      const nextMatches = await onLoadMatches(result.xuid, matches.length, 25);
      setMatches((prev) => [...prev, ...nextMatches]);
    } catch {
      // Keep existing data visible.
    } finally {
      setLoadingMatches(false);
    }
  };

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-tracker-title"
    >
      <div
        className={styles.dialog}
        onClick={(event): void => {
          event.stopPropagation();
        }}
      >
        <header className={styles.header}>
          <h2 id="add-tracker-title" className={styles.title}>
            Add Tracker
          </h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close add tracker dialog">
            ×
          </button>
        </header>

        <div className={styles.content}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>1. Gamertag</h3>
            <p className={styles.sectionDescription}>
              Search for the gamertag to track. The result includes a lightweight service record preview.
            </p>

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

            {searchError != null && <p className={styles.errorText}>{searchError}</p>}

            {result != null && (
              <div className={styles.previewCard}>
                <p className={styles.previewTitle}>{result.gamertag}</p>
                <p className={styles.previewMeta}>XUID: {result.xuid}</p>
                <p className={styles.previewMeta}>
                  Rank: {result.rankLabel ?? "n/a"} • CSR: {result.csrLabel ?? "n/a"}
                </p>
              </div>
            )}
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>2. Game history selection</h3>
            <p className={styles.sectionDescription}>
              Optional — you can skip this section and start with an empty state.
            </p>

            {result == null ? (
              <p className={styles.mutedText}>Search for a gamertag first to load recent matches.</p>
            ) : (
              <>
                <div className={styles.matchesList}>
                  {matches.length === 0 && !loadingMatches ? (
                    <p className={styles.mutedText}>No recent matches loaded.</p>
                  ) : (
                    matches.map((match) => {
                      const checked = selectedMatchIds.includes(match.matchId);
                      return (
                        <label key={match.matchId} className={styles.matchRow}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event): void => {
                              const isChecked = event.currentTarget.checked;
                              setSelectedMatchIds((prev) => {
                                if (isChecked) {
                                  return [...prev, match.matchId];
                                }
                                return prev.filter((id) => id !== match.matchId);
                              });
                            }}
                          />
                          <span className={styles.matchText}>{formatMatchLabel(match)}</span>
                        </label>
                      );
                    })
                  )}
                </div>

                <div className={styles.loadMoreRow}>
                  <Button variant="secondary" onClick={(): void => void loadMore()} disabled={loadingMatches}>
                    {loadingMatches ? "Loading..." : "Load more"}
                  </Button>
                </div>
              </>
            )}
          </section>
        </div>

        <footer className={styles.footer}>
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
        </footer>
      </div>
    </div>
  );
}
