import React from "react";
import classNames from "classnames";
import { RankIcon } from "../../icons/rank-icon";
import styles from "./tracker-summary.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrackerSearchResult {
  readonly gamertag: string;
  readonly xuid: string;
  readonly csrLabel: string | null;
  readonly currentRankTier: string | null;
  readonly currentRankSubTier: number | null;
  readonly currentRankMeasurementMatchesRemaining: number | null;
  readonly currentRankInitialMeasurementMatches: number | null;
  readonly allTimePeakCsrLabel: string | null;
  readonly allTimePeakRankTier: string | null;
  readonly allTimePeakRankSubTier: number | null;
  readonly seasonPeakCsrLabel: string | null;
  readonly seasonPeakRankTier: string | null;
  readonly seasonPeakRankSubTier: number | null;
  readonly matchmadeMatchCount: number | null;
  readonly customMatchCount: number | null;
}

interface TrackerSummaryProps {
  readonly tracker: TrackerSearchResult;
  readonly className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCsr(value: string | null): string {
  if (value === null || value === "-") {
    return "-";
  }

  const numValue = Number.parseInt(value, 10);
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

// ─── Component ────────────────────────────────────────────────────────────────

export function TrackerSummary({ tracker, className }: TrackerSummaryProps): React.ReactElement {
  const combinedClassName = classNames(styles.summaryCard, className);

  return (
    <div className={combinedClassName}>
      <p className={styles.summaryMeta}>
        <span className={styles.statLine}>
          <span className={styles.statItem}>
            <span className={styles.statLabel}>Current rank:</span>
            <RankIcon
              rankTier={tracker.currentRankTier}
              subTier={tracker.currentRankSubTier}
              measurementMatchesRemaining={tracker.currentRankMeasurementMatchesRemaining}
              initialMeasurementMatches={tracker.currentRankInitialMeasurementMatches}
              size="small"
            />
            <span className={styles.statValue}>{formatCsr(tracker.csrLabel)}</span>
          </span>
          <span className={styles.statItem}>
            <span className={styles.statLabel}>Season peak:</span>
            <RankIcon
              rankTier={tracker.seasonPeakRankTier}
              subTier={tracker.seasonPeakRankSubTier}
              measurementMatchesRemaining={null}
              initialMeasurementMatches={null}
              size="small"
            />
            <span className={styles.statValue}>{formatCsr(tracker.seasonPeakCsrLabel)}</span>
          </span>
          <span className={styles.statItem}>
            <span className={styles.statLabel}>All time peak:</span>
            <RankIcon
              rankTier={tracker.allTimePeakRankTier}
              subTier={tracker.allTimePeakRankSubTier}
              measurementMatchesRemaining={null}
              initialMeasurementMatches={null}
              size="small"
            />
            <span className={styles.statValue}>{formatCsr(tracker.allTimePeakCsrLabel)}</span>
          </span>
        </span>
      </p>
      <p className={styles.summaryMeta}>
        <span className={styles.statLine}>
          <span className={styles.statItem}>
            <span className={styles.statLabel}>Matchmaking games:</span>
            <span className={styles.statValue}>{formatMatchCount(tracker.matchmadeMatchCount)}</span>
          </span>
          <span className={styles.statItem}>
            <span className={styles.statLabel}>Custom games:</span>
            <span className={styles.statValue}>{formatMatchCount(tracker.customMatchCount)}</span>
          </span>
        </span>
      </p>
    </div>
  );
}
