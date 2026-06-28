import React, { memo } from "react";
import type { StatsHighlightItem } from "@guilty-spark/shared/contracts/individual-tracker/view";
import styles from "./overlay-stats-highlights.module.css";

interface OverlayStatsHighlightsProps {
  readonly items: readonly StatsHighlightItem[];
}

function OverlayStatsHighlightsComponent({ items }: OverlayStatsHighlightsProps): React.ReactElement | null {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className={styles.statsHighlights}>
      {items.map((item, i) => (
        <div key={i} className={styles.stat}>
          <span className={styles.statLabel}>{item.label}</span>
          <span className={styles.statValue}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export const OverlayStatsHighlights = memo(OverlayStatsHighlightsComponent);
