import React from "react";
import type { ImageMetadata } from "astro";
import assaultPng from "../../assets/game-modes/assault.png";
import captureTheFlagPng from "../../assets/game-modes/capture-the-flag.png";
import strongholdsPng from "../../assets/game-modes/strongholds.png";
import oddballPng from "../../assets/game-modes/oddball.png";
import slayerPng from "../../assets/game-modes/slayer.png";
import kingOfTheHillPng from "../../assets/game-modes/king-of-the-hill.png";
import { TeamIcon } from "../icons/team-icon";
import { Button } from "../button/button";
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
  readonly onAddToAboveGroup: (matchId: string) => void;
  readonly onAddToBelowGroup: (matchId: string) => void;
  readonly onBreakFromGroup: (matchId: string) => void;
}

export function MatchSelectionList({
  matches,
  selectedMatchIds,
  groupings,
  onMatchToggle,
  onSelectAll,
  onDeselectAll,
  onStartTracker,
  onAddToAboveGroup,
  onAddToBelowGroup,
  onBreakFromGroup,
}: MatchSelectionListProps): React.ReactElement {
  // Create a map of matchId to group index
  const matchToGroupIndex = new Map<string, number>();
  for (let i = 0; i < groupings.length; i++) {
    for (const matchId of groupings[i]) {
      matchToGroupIndex.set(matchId, i);
    }
  }

  // Helper to determine position in group
  const getGroupPosition = (matchId: string): { isFirst: boolean; isLast: boolean; inGroup: boolean } => {
    const groupIndex = matchToGroupIndex.get(matchId);
    if (groupIndex === undefined) {
      return { isFirst: false, isLast: false, inGroup: false };
    }

    const group = groupings[groupIndex];
    const posInGroup = group.indexOf(matchId);
    return {
      isFirst: posInGroup === 0,
      isLast: posInGroup === group.length - 1,
      inGroup: true,
    };
  };

  const selectedCount = selectedMatchIds.size;
  const allSelected = selectedCount === matches.length;

  function gameModeIconUrl(gameMode: string): ImageMetadata {
    if (gameMode.includes("Capture the Flag") || gameMode.includes("CTF")) {
      return captureTheFlagPng;
    } else if (gameMode.includes("Strongholds")) {
      return strongholdsPng;
    } else if (gameMode.includes("Oddball")) {
      return oddballPng;
    } else if (gameMode.includes("King of the Hill") || gameMode.includes("KOTH")) {
      return kingOfTheHillPng;
    } else if (gameMode.includes("Neutral Bomb")) {
      return assaultPng;
    } else {
      return slayerPng;
    }
  }

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
          <Button onClick={allSelected ? onDeselectAll : onSelectAll} variant="secondary">
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
          <Button onClick={onStartTracker} variant="primary">
            {selectedCount === 0 ? "Start Tracker (From Now)" : `Start Tracker (${selectedCount.toLocaleString()})`}
          </Button>
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
        {matches.map((match, matchIndex) => {
          const isSelected = selectedMatchIds.has(match.matchId);
          const groupIndex = matchToGroupIndex.get(match.matchId);
          const groupColor = groupIndex !== undefined ? getGroupColor(groupIndex) : undefined;
          const groupPosition = getGroupPosition(match.matchId);
          const isFirstMatch = matchIndex === 0;
          const isLastMatch = matchIndex === matches.length - 1;

          // Check if already grouped with adjacent matches
          const aboveMatchId = !isFirstMatch ? matches[matchIndex - 1].matchId : null;
          const belowMatchId = !isLastMatch ? matches[matchIndex + 1].matchId : null;
          const aboveGroupIndex = aboveMatchId != null ? matchToGroupIndex.get(aboveMatchId) : undefined;
          const belowGroupIndex = belowMatchId != null ? matchToGroupIndex.get(belowMatchId) : undefined;
          const isGroupedWithAbove = groupIndex !== undefined && groupIndex === aboveGroupIndex;
          const isGroupedWithBelow = groupIndex !== undefined && groupIndex === belowGroupIndex;

          return (
            <div
              key={match.matchId}
              className={`${styles.matchCard} ${isSelected ? styles.selected : ""} ${
                groupPosition.inGroup ? styles.grouped : ""
              } ${groupPosition.isFirst && !groupPosition.isLast ? styles.groupFirst : ""} ${
                groupPosition.isLast && !groupPosition.isFirst ? styles.groupLast : ""
              } ${groupPosition.inGroup && !groupPosition.isFirst && !groupPosition.isLast ? styles.groupMiddle : ""}`}
              style={
                {
                  "--map-bg": `url(${match.mapThumbnailUrl})`,
                  borderLeftColor: groupColor,
                  "--group-color": groupColor,
                } as React.CSSProperties
              }
            >
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={isSelected}
                  onChange={(): void => {
                    onMatchToggle(match.matchId);
                  }}
                />
              </label>
              <div className={styles.matchContent}>
                <div className={styles.matchHeader}>
                  <div className={styles.matchHeaderContent}>
                    <h3 className={styles.matchTitle}>
                      {match.isMatchmaking ? "Matchmaking" : "Custom"}: {match.modeName} • {match.mapName}
                    </h3>
                    <ul className={styles.matchMetadata}>
                      <li>
                        <span className={styles.matchMetaLabel}>Outcome:</span>{" "}
                        <span
                          className={`${styles.matchMetaValue} ${styles.outcome} ${styles[match.outcome.toLowerCase()]}`}
                        >
                          {match.resultString}
                        </span>
                      </li>
                      <li>
                        <span className={styles.matchMetaLabel}>Duration:</span>{" "}
                        <span className={styles.matchMetaValue}>{match.duration}</span>
                      </li>
                      <li>
                        <span className={styles.matchMetaLabel}>Start:</span>{" "}
                        <span className={styles.matchMetaValue}>{match.startTime}</span>
                      </li>
                      <li>
                        <span className={styles.matchMetaLabel}>End:</span>{" "}
                        <span className={styles.matchMetaValue}>{match.endTime}</span>
                      </li>
                    </ul>
                  </div>
                  <img src={gameModeIconUrl(match.modeName).src} alt={match.modeName} className={styles.gameModeIcon} />
                </div>
                {match.teams.length > 0 && (
                  <div className={styles.teamsSection}>
                    {match.teams.map((team, teamIndex) => (
                      <div key={teamIndex} className={styles.team}>
                        <TeamIcon teamId={teamIndex} size="small" />
                        <span className={styles.teamPlayers}>{[...team].sort().join(", ")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.groupControls}>
                {!isFirstMatch && !isGroupedWithAbove && (
                  <button
                    type="button"
                    className={styles.groupButton}
                    onClick={(e): void => {
                      e.stopPropagation();
                      onAddToAboveGroup(match.matchId);
                    }}
                    title="Add to above group"
                  >
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M12 19V5M5 12l7-7 7 7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
                {groupPosition.inGroup && (
                  <button
                    type="button"
                    className={styles.groupButton}
                    onClick={(e): void => {
                      e.stopPropagation();
                      onBreakFromGroup(match.matchId);
                    }}
                    title="Break from group"
                  >
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M18 6L6 18M6 6l12 12"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
                {!isLastMatch && !isGroupedWithBelow && (
                  <button
                    type="button"
                    className={styles.groupButton}
                    onClick={(e): void => {
                      e.stopPropagation();
                      onAddToBelowGroup(match.matchId);
                    }}
                    title="Add to below group"
                  >
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M12 5v14m-7-7l7 7 7-7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
