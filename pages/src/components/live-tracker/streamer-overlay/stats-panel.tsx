import React, { memo } from "react";
import { CSSTransition } from "react-transition-group";
import type { PlayerAssociationData } from "@guilty-spark/shared/live-tracker/types";
import type { TeamColor } from "../../team-colors/team-colors";
import { MatchStats as MatchStatsView } from "../../stats/match-stats";
import { SeriesStats } from "../../stats/series-stats";
import type { MatchStatsData } from "../../stats/types";
import type { SeriesMetadata } from "../../stats/series-metadata";
import { PlayerPreSeriesInfo } from "../../player-pre-series-info/player-pre-series-info";
import type { LiveTrackerMatchRenderModel, LiveTrackerTeamRenderModel } from "../types";
import styles from "./streamer-overlay.module.css";

interface StatsPanelProps {
  readonly isPanelOpen: boolean;
  readonly nodeRef: React.RefObject<HTMLDivElement | null>;
  readonly onClosePanel: () => void;
  readonly selectedTab: number;
  readonly teams: readonly LiveTrackerTeamRenderModel[];
  readonly playersAssociationData: Record<string, PlayerAssociationData> | null;
  readonly matchesLength: number;
  readonly seriesStats: {
    teamData: MatchStatsData[];
    playerData: MatchStatsData[];
    metadata: SeriesMetadata | null;
  } | null;
  readonly selectedMatchStats: MatchStatsData[] | null;
  readonly selectedMatch: LiveTrackerMatchRenderModel | null;
  readonly teamColors: TeamColor[];
  readonly gameModeIconUrl: (gameMode: string) => string;
}

function StatsPanelComponent({
  isPanelOpen,
  nodeRef,
  onClosePanel,
  selectedTab,
  teams,
  playersAssociationData,
  matchesLength,
  seriesStats,
  selectedMatchStats,
  selectedMatch,
  teamColors,
  gameModeIconUrl,
}: StatsPanelProps): React.ReactElement {
  return (
    <CSSTransition
      in={isPanelOpen}
      timeout={300}
      classNames={{
        enter: styles.panelEnter,
        enterActive: styles.panelEnterActive,
        exit: styles.panelExit,
        exitActive: styles.panelExitActive,
      }}
      nodeRef={nodeRef}
      unmountOnExit
    >
      <div ref={nodeRef} className={styles.statsPanel} onClick={onClosePanel}>
        <div
          className={styles.statsPanelContent}
          onClick={(e): void => {
            e.stopPropagation();
          }}
        >
          <button type="button" className={styles.closeButton} onClick={onClosePanel}>
            ✕
          </button>
          {selectedTab === -1 && matchesLength === 0 && playersAssociationData != null ? (
            <PlayerPreSeriesInfo
              teams={teams}
              playersAssociationData={playersAssociationData}
              teamColors={teamColors}
            />
          ) : null}
          {selectedTab === -1 && seriesStats != null && matchesLength > 0 ? (
            <SeriesStats
              teamData={seriesStats.teamData}
              playerData={seriesStats.playerData}
              title="Series Totals"
              metadata={seriesStats.metadata}
              teamColors={teamColors}
            />
          ) : null}
          {selectedTab >= 0 && selectedMatchStats != null && selectedMatch != null ? (
            <MatchStatsView
              data={selectedMatchStats}
              id={selectedMatch.matchId}
              backgroundImageUrl={selectedMatch.gameMapThumbnailUrl}
              gameModeIconUrl={gameModeIconUrl(selectedMatch.gameType)}
              gameModeAlt={selectedMatch.gameType}
              matchNumber={selectedTab + 1}
              gameTypeAndMap={selectedMatch.gameTypeAndMap}
              duration={selectedMatch.duration}
              score={selectedMatch.gameScore}
              startTime={selectedMatch.startTime}
              endTime={selectedMatch.endTime}
              teamColors={teamColors}
            />
          ) : null}
        </div>
      </div>
    </CSSTransition>
  );
}

export const StatsPanel = memo(StatsPanelComponent);
