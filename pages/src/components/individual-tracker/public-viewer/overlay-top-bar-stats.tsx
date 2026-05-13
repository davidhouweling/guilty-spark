import React, { memo } from "react";
import type { IndividualTrackerTopBarStatItem } from "../top-bar-stats";
import { RankIcon } from "../../icons/rank-icon";
import styles from "./overlay-top-bar-stats.module.css";

interface OverlayTopBarStatsProps {
  readonly items: readonly IndividualTrackerTopBarStatItem[];
}

const OverlayTopBarStatsComponent = ({ items }: OverlayTopBarStatsProps): React.ReactElement | null => {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={styles.root}>
      {
        <div className={styles.row} aria-label="Overlay top bar stats">
          {items.map((item, index) => (
            <div key={`${item.option}-${index.toString()}`} className={styles.tab}>
              <span className={styles.label}>{item.label}</span>
              <span className={styles.dot} aria-hidden="true">
                •
              </span>
              <span className={styles.value}>
                {item.rankTier != null && (
                  <>
                    <RankIcon
                      rankTier={item.rankTier}
                      subTier={item.rankSubTier ?? null}
                      measurementMatchesRemaining={item.rankMeasurementMatchesRemaining ?? null}
                      initialMeasurementMatches={item.rankInitialMeasurementMatches ?? null}
                      size="small"
                    />{" "}
                  </>
                )}
                <span className={styles.valueText}>{item.value}</span>
              </span>
            </div>
          ))}
        </div>
      }
    </div>
  );
};

export const OverlayTopBarStats = memo(OverlayTopBarStatsComponent);
