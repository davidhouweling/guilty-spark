import React from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { Alert } from "../../alert/alert";
import { LoadingState } from "../../loading-state/loading-state";
import { MatchStats } from "../../stats/match-stats";
import { gameModeIconSrc } from "../game-mode-icon";
import type { MatchStatsPanelState } from "./types";
import styles from "./stats-panel.module.css";

interface StatsPanelProps {
  readonly state: MatchStatsPanelState | null;
}

export function StatsPanel({ state }: StatsPanelProps): React.ReactElement | null {
  if (state == null) {
    return null;
  }

  switch (state.status) {
    case "loading": {
      return (
        <div className={styles.wrapper}>
          <LoadingState />
        </div>
      );
    }
    case "error": {
      return (
        <div className={styles.wrapper}>
          <Alert variant="error">{state.message}</Alert>
        </div>
      );
    }
    case "loaded": {
      return (
        <div className={styles.wrapper}>
          <MatchStats
            data={state.data}
            id={state.matchId}
            backgroundImageUrl=""
            gameModeIconUrl={gameModeIconSrc(state.gameVariantCategory)}
            gameModeAlt=""
            matchNumber={1}
            gameTypeAndMap=""
            duration={state.duration}
            score=""
            startTime={state.startTime}
            endTime={state.endTime}
            killMatrixPivotData={state.killMatrixPivotData}
          />
        </div>
      );
    }
    default: {
      throw new UnreachableError(state);
    }
  }
}
