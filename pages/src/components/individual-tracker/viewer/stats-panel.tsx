import React, { useMemo } from "react";
import type { MatchStats as MatchStatsType } from "halo-infinite-api";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import { Alert } from "../../alert/alert";
import { LoadingState } from "../../loading-state/loading-state";
import { createMatchStatsPresenter } from "../../stats/create";
import { MatchStats } from "../../stats/match-stats";
import type { MatchStatsData } from "../../stats/types";
import { gameModeIconSrc } from "../game-mode-icon";
import type { IndividualTrackerViewerViewModel } from "./types";
import styles from "./stats-panel.module.css";

interface LoadedStatsPanelProps {
  readonly stats: MatchStatsType;
  readonly playerMap: Map<string, string>;
  readonly medalMetadata: MedalMetadata;
}

function LoadedStatsPanel({ stats, playerMap, medalMetadata }: LoadedStatsPanelProps): React.ReactElement {
  const data = useMemo<MatchStatsData[]>(() => {
    const presenter = createMatchStatsPresenter(stats.MatchInfo.GameVariantCategory);
    return presenter.getData(stats, playerMap, medalMetadata);
  }, [stats, playerMap, medalMetadata]);

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
      return <LoadedStatsPanel stats={state.stats} playerMap={state.playerMap} medalMetadata={state.medalMetadata} />;
    }
    default: {
      throw new UnreachableError(state);
    }
  }
}
