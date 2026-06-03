import React from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import { Alert } from "../../alert/alert";
import { LoadingState } from "../../loading-state/loading-state";
import { createMatchStatsPresenter } from "../../stats/create";
import { MatchStats } from "../../stats/match-stats";
import type { MatchStatsData } from "../../stats/types";
import { gameModeIconSrc } from "../game-mode-icon";
import type { IndividualTrackerViewerViewModel } from "./types";
import styles from "./stats-panel.module.css";

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
      const { stats } = state;
      const presenter = createMatchStatsPresenter(stats.MatchInfo.GameVariantCategory);
      const playerMap = new Map(stats.Players.map((p) => [getPlayerXuid(p), getPlayerXuid(p)]));
      const data: MatchStatsData[] = presenter.getData(stats, playerMap, {});

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
          />
        </div>
      );
    }
    default: {
      throw new UnreachableError(state);
    }
  }
}
