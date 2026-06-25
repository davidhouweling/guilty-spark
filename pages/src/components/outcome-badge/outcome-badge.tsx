import type { ReactElement } from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { NormalizedMatchOutcome } from "@guilty-spark/shared/halo/match-enrichment";
import styles from "./outcome-badge.module.css";

interface OutcomeBadgeProps {
  readonly outcome: NormalizedMatchOutcome;
}

function formatOutcomeLabel(outcome: NormalizedMatchOutcome): string {
  switch (outcome) {
    case "win": {
      return "Win";
    }
    case "loss": {
      return "Loss";
    }
    case "tie": {
      return "Tie";
    }
    case "dnf": {
      return "DNF";
    }
    case "unknown": {
      return "Unknown";
    }
    default: {
      throw new UnreachableError(outcome);
    }
  }
}

export function OutcomeBadge({ outcome }: OutcomeBadgeProps): ReactElement {
  return (
    <span className={styles.outcomeBadge} data-outcome={outcome}>
      {formatOutcomeLabel(outcome)}
    </span>
  );
}
