import type { ReactElement } from "react";
import type { NormalizedMatchOutcome } from "@guilty-spark/shared/halo/match-enrichment";
import styles from "./outcome-badge.module.css";

interface OutcomeBadgeProps {
  readonly outcome: NormalizedMatchOutcome | "In progress";
}

export function OutcomeBadge({ outcome }: OutcomeBadgeProps): ReactElement {
  return (
    <span className={styles.outcomeBadge} data-outcome={outcome}>
      {outcome}
    </span>
  );
}
