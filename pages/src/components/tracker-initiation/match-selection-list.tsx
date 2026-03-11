import React from "react";
import styles from "./match-selection-list.module.css";
import type { MatchHistoryEntry } from "./types";

interface MatchSelectionListProps {
  readonly matches: MatchHistoryEntry[];
  readonly selectedMatchIds: ReadonlySet<string>;
  readonly groupings: readonly (readonly string[])[];
  readonly onMatchToggle: (matchId: string) => void;
  readonly onSelectAll: () => void;
  readonly onDeselectAll: () => void;
  readonly onStartTracker: () => void;
}

export function MatchSelectionList({
  matches,
  selectedMatchIds,
  groupings,
  onMatchToggle,
  onSelectAll,
  onDeselectAll,
  onStartTracker,
}: MatchSelectionListProps): React.ReactElement {
  // Create a map of matchId to group index
  const matchToGroupIndex = new Map<string, number>();
  for (let i = 0; i < groupings.length; i++) {
    for (const matchId of groupings[i]) {
      matchToGroupIndex.set(matchId, i);
    }
  }

  const selectedCount = selectedMatchIds.size;
  const allSelected = selectedCount === matches.length;

  const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getGroupColor = (groupIndex: number): string => {
    const colors = [
      "var(--halo-teal-primary)",
      "var(--halo-cyan)",
      "var(--halo-accent)",
      "var(--color-warning)",
      "#9c27b0",
      "#e91e63",
    ];
    return colors[groupIndex % colors.length];
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <h2 className={styles.title}>Match History</h2>
          <p className={styles.matchCount}>
            {selectedCount} of {matches.length} matches selected
          </p>
        </div>
        <div className={styles.buttonGroup}>
          <button type="button" className={styles.selectButton} onClick={allSelected ? onDeselectAll : onSelectAll}>
            {allSelected ? "Deselect All" : "Select All"}
          </button>
          <button type="button" className={styles.startButton} onClick={onStartTracker} disabled={selectedCount === 0}>
            Start Tracker ({selectedCount})
          </button>
        </div>
      </div>

      {groupings.length > 0 && (
        <div className={styles.groupingInfo}>
          <svg className={styles.infoIcon} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <path d="M12 16v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="8" r="1" fill="currentColor" />
          </svg>
          <span>
            {groupings.length} series detected. Colored borders indicate matches that belong to the same series.
          </span>
        </div>
      )}

      <div className={styles.matchList}>
        {matches.map((match) => {
          const isSelected = selectedMatchIds.has(match.matchId);
          const groupIndex = matchToGroupIndex.get(match.matchId);
          const groupColor = groupIndex !== undefined ? getGroupColor(groupIndex) : undefined;

          return (
            <label
              key={match.matchId}
              className={`${styles.matchCard} ${isSelected ? styles.selected : ""}`}
              style={
                groupColor != null
                  ? {
                      borderLeft: `4px solid ${groupColor}`,
                    }
                  : undefined
              }
            >
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={isSelected}
                onChange={(): void => {
                  onMatchToggle(match.matchId);
                }}
              />
              <div className={styles.matchInfo}>
                <div className={styles.matchHeader}>
                  <span className={styles.matchType}>{match.isMatchmaking ? "Matchmaking" : "Custom"}</span>
                  <span className={styles.matchDate}>{formatDate(match.startTime)}</span>
                </div>
                <div className={styles.matchDetails}>
                  <span className={styles.modeName}>{match.modeName}</span>
                  <span className={styles.separator}>•</span>
                  <span className={styles.mapName}>{match.mapName}</span>
                </div>
                <div className={styles.matchOutcome}>
                  <span className={`${styles.outcome} ${styles[match.outcome.toLowerCase()]}`}>{match.outcome}</span>
                  <span className={styles.separator}>•</span>
                  <span className={styles.resultString}>{match.resultString}</span>
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
