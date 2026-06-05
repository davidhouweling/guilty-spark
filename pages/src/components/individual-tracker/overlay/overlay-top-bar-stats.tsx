import React, { memo } from "react";
import type { TopBarStatItem } from "@guilty-spark/shared/contracts/individual-tracker/view";
import styles from "./overlay-top-bar-stats.module.css";

interface OverlayTopBarStatsProps {
  readonly items: readonly TopBarStatItem[];
}

function OverlayTopBarStatsComponent({ items }: OverlayTopBarStatsProps): React.ReactElement | null {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className={styles.topBarStats}>
      {items.map((item, i) => (
        <div key={i} className={styles.stat}>
          <span className={styles.statLabel}>{item.label}</span>
          <span className={styles.statValue}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export const OverlayTopBarStats = memo(OverlayTopBarStatsComponent);
