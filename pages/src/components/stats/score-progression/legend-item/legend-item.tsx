import React from "react";
import styles from "../score-progression.module.css";

interface LegendItemProps {
  readonly swatch: React.ReactNode;
  readonly text: string;
}

export function LegendItem({ swatch, text }: LegendItemProps): React.ReactElement {
  return (
    <span className={styles.markerLegendItem}>
      <svg width="14" height="14" aria-hidden="true">
        {swatch}
      </svg>
      {text}
    </span>
  );
}
