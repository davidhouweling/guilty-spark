import React from "react";
import type { TopBarStatItem } from "@guilty-spark/shared/contracts/individual-tracker/view";
import styles from "./viewer-top-bar-stats.module.css";

interface ViewerTopBarStatsProps {
  readonly items: readonly TopBarStatItem[];
}

export function ViewerTopBarStats({ items }: ViewerTopBarStatsProps): React.ReactElement | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className={styles.grid} aria-label="Viewer top bar stats">
      {items.map((item, index) => (
        <li key={`${item.label}-${item.value}-${index.toString()}`} className={styles.card}>
          <span className={styles.label}>{item.label}</span>
          <span className={styles.value}>{item.value}</span>
        </li>
      ))}
    </ul>
  );
}