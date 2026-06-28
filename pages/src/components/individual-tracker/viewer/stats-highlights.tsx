import React from "react";
import classNames from "classnames";
import type { TopBarStatItem } from "@guilty-spark/shared/contracts/individual-tracker/view";
import styles from "./stats-highlights.module.css";

interface StatsHighlightsProps {
  readonly items: readonly TopBarStatItem[];
}

export function StatsHighlights({ items }: StatsHighlightsProps): React.ReactElement | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul
      className={classNames(styles.statsHighlights, {
        [styles.gridEightItems]: items.length === 8,
      })}
      aria-label="Stats highlights"
    >
      {items.map((item, index) => (
        <li key={`${item.label}-${item.value}-${index.toString()}`} className={styles.card}>
          <span className={styles.label}>{item.label}</span>
          <span className={styles.value}>{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
