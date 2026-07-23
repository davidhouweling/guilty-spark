import React from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { normalizeOutcomeString } from "@guilty-spark/shared/halo/match-enrichment";
import { Heading } from "../heading/heading";
import type { TrackerMatchHistoryEntry } from "../../services/individual-tracker/types";
import { gameModeIconSrc } from "../individual-tracker/game-mode-icon";
import { Checkbox } from "../checkbox/checkbox";
import { TeamIcon } from "../icons/team-icon";
import { OutcomeBadge } from "../outcome-badge/outcome-badge";
import styles from "./match-card.module.css";

export interface MatchCardProps {
  readonly entry: TrackerMatchHistoryEntry;
  readonly isSelected?: boolean;
  readonly isGroupStart?: boolean;
  readonly isGroupEnd?: boolean;
  readonly groupColor?: string;
  readonly showGrouping?: boolean;
  readonly canAddToAbove?: boolean;
  readonly canAddToBelow?: boolean;
  readonly canBreakFromGroup?: boolean;
  readonly allowSelection?: boolean;
  readonly onToggle?: () => void;
  readonly onAddToAbove?: () => void;
  readonly onAddToBelow?: () => void;
  readonly onBreakFromGroup?: () => void;
}

function getCategoryLabel(category: TrackerMatchHistoryEntry["category"]): string {
  switch (category) {
    case "matchmaking": {
      return "Matchmaking";
    }
    case "custom": {
      return "Custom";
    }
    case "local": {
      return "Local";
    }
    case "unknown": {
      return "Unknown";
    }
    default: {
      throw new UnreachableError(category);
    }
  }
}

export function MatchCard({
  entry,
  isSelected = false,
  isGroupStart = false,
  isGroupEnd = false,
  groupColor,
  showGrouping = false,
  canAddToAbove = false,
  canAddToBelow = false,
  canBreakFromGroup = false,
  allowSelection = false,
  onToggle,
  onAddToAbove,
  onAddToBelow,
  onBreakFromGroup,
}: MatchCardProps): React.JSX.Element {
  const modeIconSrc = gameModeIconSrc(entry.gameVariantCategory);
  const outcome = normalizeOutcomeString(entry.outcome);
  const teamListFormatter = new Intl.ListFormat(undefined, { style: "narrow", type: "conjunction" });
  const categoryLabel = getCategoryLabel(entry.category);
  const subtitle = entry.category === "matchmaking" ? entry.matchmakingPlaylist : undefined;

  const cardStyle = {
    "--map-bg": `url(${entry.mapThumbnailUrl})`,
    ...(groupColor != null ? { "--group-color": groupColor } : {}),
  } as React.CSSProperties;

  const showManualGroupingControls = canAddToAbove || canAddToBelow || canBreakFromGroup;

  return (
    <div
      className={[
        styles.card,
        isGroupStart ? styles.groupStart : null,
        isGroupEnd ? styles.groupEnd : null,
        showGrouping && groupColor != null ? styles.grouped : null,
      ]
        .filter((c): c is string => c != null)
        .join(" ")}
      style={cardStyle}
    >
      {allowSelection && (
        <Checkbox checked={isSelected} onChange={() => onToggle?.()} label="" id={`match-${entry.matchId}`} />
      )}

      <div
        className={[styles.cardContent, showManualGroupingControls ? styles.cardContentWithControls : null]
          .filter((c): c is string => c != null)
          .join(" ")}
      >
        <div className={styles.cardMain}>
          <div className={styles.matchHeader}>
            <div className={styles.matchHeaderContent}>
              <div className={styles.matchTitleRow}>
                <Heading tagName="h3" className={styles.matchTitle}>
                  {entry.modeName}: {entry.mapName}
                </Heading>
                <span className={styles.categoryBadge} data-category={entry.category}>
                  {categoryLabel}
                </span>
              </div>
              {subtitle != null && subtitle !== "" ? <p className={styles.matchSubtitle}>{subtitle}</p> : null}
              <ul className={styles.matchMetadata}>
                <li>
                  <span className={styles.matchMetaLabel}>Score:</span>{" "}
                  <span className={styles.matchMetaValue}>{entry.resultString}</span>
                </li>
                <li>
                  <span className={styles.matchMetaLabel}>Duration:</span>{" "}
                  <span className={styles.matchMetaValue}>{entry.duration}</span>
                </li>
                <li>
                  <span className={styles.matchMetaLabel}>Start time:</span>{" "}
                  <span className={styles.matchMetaValue}>{entry.startTime}</span>
                </li>
                <li>
                  <span className={styles.matchMetaLabel}>End time:</span>{" "}
                  <span className={styles.matchMetaValue}>{entry.endTime}</span>
                </li>
              </ul>
            </div>
            <div className={styles.matchHeaderRight}>
              <img src={modeIconSrc} alt={entry.modeName} className={styles.gameModeIcon} />
              <OutcomeBadge outcome={outcome} />
            </div>
          </div>

          {entry.teams.length > 0 && (
            <div className={styles.teams}>
              {entry.teams.map((team, teamIndex) => (
                <div key={teamIndex} className={styles.team}>
                  <TeamIcon teamId={teamIndex} size="x-small" />
                  <span className={styles.teamPlayers}>{teamListFormatter.format(Array.from(team))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {showManualGroupingControls && (
          <div className={styles.groupControls}>
            {canAddToAbove && (
              <button className={styles.controlButton} onClick={onAddToAbove} type="button" title="Add to group above">
                ↑
              </button>
            )}
            {canBreakFromGroup && (
              <button
                className={styles.controlButton}
                onClick={onBreakFromGroup}
                type="button"
                title="Break from group"
              >
                ✕
              </button>
            )}
            {canAddToBelow && (
              <button className={styles.controlButton} onClick={onAddToBelow} type="button" title="Add to group below">
                ↓
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
