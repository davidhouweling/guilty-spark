import React from "react";
import type { IndividualTrackerTopBarStatItem } from "../top-bar-stats";
import styles from "./viewer-top-bar-stats.module.css";

interface ViewerTopBarStatsProps {
  readonly items: readonly IndividualTrackerTopBarStatItem[];
}

export function ViewerTopBarStats({ items }: ViewerTopBarStatsProps): React.ReactElement | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className={styles.grid} aria-label="Viewer top bar stats">
      {items.map((item, index) => (
        <li key={`${item.option}-${index.toString()}`} className={styles.card}>
          <span className={styles.label}>{item.label}</span>
          <span className={styles.value}>{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
