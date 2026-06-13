import React, { useMemo } from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { KillMatrixPresenter } from "../../stats/kill-matrix/kill-matrix-presenter";
import { Alert } from "../../alert/alert";
import { LoadingState } from "../../loading-state/loading-state";
import { createMatchStatsPresenter } from "../../stats/create";
import { MatchStats } from "../../stats/match-stats";
import type { MatchStatsData } from "../../stats/types";
import { gameModeIconSrc } from "../game-mode-icon";
import type { IndividualTrackerViewerViewModel } from "./types";
import type { MatchStatsState } from "./viewer-store";
import styles from "./stats-panel.module.css";

interface LoadedStatsPanelProps {
  readonly state: Extract<MatchStatsState, { readonly status: "loaded" }>;
}

function LoadedStatsPanel({ state }: LoadedStatsPanelProps): React.ReactElement {
  const { stats, playerMap, medalMetadata, analytics } = state;
  const data = useMemo<MatchStatsData[]>(() => {
    const presenter = createMatchStatsPresenter(stats.MatchInfo.GameVariantCategory);
    return presenter.getData(stats, playerMap, medalMetadata);
  }, [stats, playerMap, medalMetadata]);

  const killMatrixRows = useMemo(() => {
    if (analytics == null) {
      return [];
    }

    const playersByXuid = new Map(
      [...playerMap.entries()].map(([xuid, gamertag]) => [xuid, { gamertag, teamId: null }]),
    );

    return KillMatrixPresenter.present({ analytics, playersByXuid });
  }, [analytics, playerMap]);

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
