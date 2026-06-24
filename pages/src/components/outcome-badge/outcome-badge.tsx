import type { ReactElement } from "react";
import styles from "./outcome-badge.module.css";

export type OutcomeBadgeValue = "Win" | "Loss" | "Tie" | "DNF" | "Unknown";

interface OutcomeBadgeProps {
  readonly outcome: OutcomeBadgeValue;
}

export function OutcomeBadge({ outcome }: OutcomeBadgeProps): ReactElement {
  return (
    <span className={styles.outcomeBadge} data-outcome={outcome.toLowerCase()}>
      {outcome}
    </span>
  );
}
