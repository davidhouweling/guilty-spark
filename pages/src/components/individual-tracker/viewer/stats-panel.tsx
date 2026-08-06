import React from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { Alert } from "../../alert/alert";
import { LoadingState } from "../../loading-state/loading-state";
import { MatchStats } from "../../stats/match-stats";
import { StatsHeader } from "../../stats/stats-header";
import { OutcomeBadge } from "../../outcome-badge/outcome-badge";
import { gameModeIconSrc } from "../game-mode-icon";
import { buildMatchHeaderMetadata, buildMatchHeaderTitle, matchHeaderBackgroundStyle } from "../stats-panel-header";
import type { MatchDetailsState, ViewerMatchTab } from "./types";
import styles from "./stats-panel.module.css";

interface StatsPanelProps {
  readonly match: ViewerMatchTab | null;
  readonly state: MatchDetailsState | null;
}

export function StatsPanel({ match, state }: StatsPanelProps): React.ReactElement | null {
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
          {match != null && (
            <StatsHeader
              title={buildMatchHeaderTitle(match)}
              subtitle={match.subtitle}
              metadata={buildMatchHeaderMetadata(match)}
              backgroundStyle={matchHeaderBackgroundStyle(match.mapBackgroundUrl, state.gameMapThumbnailUrl)}
              rightContent={
                <div className={styles.headerVisuals}>
                  <img
                    src={gameModeIconSrc(match.gameVariantCategory)}
                    alt={match.gameModeName}
                    className={styles.headerModeIcon}
                  />
                  <OutcomeBadge outcome={match.outcome} />
                </div>
              }
            />
          )}
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
            transposedKillMatrixPivotData={state.transposedKillMatrixPivotData}
            crossTeamData={state.crossTeamKillMatrixData}
            swappedCrossTeamData={state.swappedCrossTeamKillMatrixData}
            killMatrixStatus={state.killMatrixStatus}
            scoreProgressionViewData={state.scoreProgressionViewData}
            showHeader={false}
          />
        </div>
      );
    }
    default: {
      throw new UnreachableError(state);
    }
  }
}
