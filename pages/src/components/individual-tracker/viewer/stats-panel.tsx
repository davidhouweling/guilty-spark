import React, { useMemo } from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { Alert } from "../../alert/alert";
import { LoadingState } from "../../loading-state/loading-state";
import { StatsController } from "../../../controllers/stats/stats-controller";
import { MatchStats } from "../../stats/match-stats";
import { gameModeIconSrc } from "../game-mode-icon";
import type { IndividualTrackerViewerViewModel } from "./types";
import type { MatchStatsState } from "./viewer-store";
import styles from "./stats-panel.module.css";

interface LoadedStatsPanelProps {
  readonly state: Extract<MatchStatsState, { readonly status: "loaded" }>;
}

function LoadedStatsPanel({ state }: LoadedStatsPanelProps): React.ReactElement {
  const { stats, playerMap, medalMetadata, analytics } = state;
  const controller = useMemo(() => new StatsController(), []);

  const data = useMemo(() => {
    controller.loadMatch(stats, playerMap, medalMetadata);
    return controller.getMatchStats();
  }, [controller, stats, playerMap, medalMetadata]);

  const killMatrixRows = useMemo(() => {
    if (analytics == null) {
      return [];
    }
    controller.loadAnalytics(analytics, playerMap);
    return controller.getKillMatrix();
  }, [controller, analytics, playerMap]);

  return (
    <div className={styles.wrapper}>
      <MatchStats
        data={data}
        id={stats.MatchId}
        backgroundImageUrl=""
        gameModeIconUrl={gameModeIconSrc(stats.MatchInfo.GameVariantCategory)}
        gameModeAlt=""
        matchNumber={1}
        gameTypeAndMap=""
        duration={stats.MatchInfo.Duration}
        score=""
        startTime={stats.MatchInfo.StartTime}
        endTime={stats.MatchInfo.EndTime}
        killMatrixRows={killMatrixRows}
      />
    </div>
  );
}

interface StatsPanelProps {
  readonly state: IndividualTrackerViewerViewModel["matchStatsState"];
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
      return <LoadedStatsPanel state={state} />;
    }
    default: {
      throw new UnreachableError(state);
    }
  }
}
