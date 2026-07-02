import React, { memo } from "react";
import type { StatsHighlightItem } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { RankIcon } from "../../icons/rank-icon";
import styles from "./overlay-stats-highlights.module.css";

interface OverlayStatsHighlightsProps {
  readonly items: readonly StatsHighlightItem[];
}

function OverlayStatsHighlightsComponent({ items }: OverlayStatsHighlightsProps): React.ReactElement | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={styles.statsHighlightsBar}>
      {items.map((item, i) => (
        <div key={i} className={styles.statTab}>
          <span className={styles.statLabel}>{item.label}</span>
          <span className={styles.statSeparator}>•</span>
          <span className={styles.statValue}>
            {item.rankIcon != null ? (
              <RankIcon
                rankTier={item.rankIcon.rankTier}
                subTier={item.rankIcon.subTier}
                measurementMatchesRemaining={item.rankIcon.measurementMatchesRemaining}
                initialMeasurementMatches={item.rankIcon.initialMeasurementMatches}
                size="x-small"
              />
            ) : null}
            <span>{item.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export const OverlayStatsHighlights = memo(OverlayStatsHighlightsComponent);
