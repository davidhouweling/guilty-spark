import React, { memo } from "react";
import type { PlayerAssociationData } from "@guilty-spark/shared/live-tracker/types";
import type { ComponentLoaderStatus } from "../../component-loader/component-loader";
import type { TeamColor } from "../../team-colors/team-colors";
import { MatchStats as MatchStatsView } from "../../stats/match-stats";
import { SeriesStats } from "../../stats/series-stats";
import type { MatchStatsData } from "../../../controllers/stats/types";
import type { SeriesMetadata } from "../../../controllers/stats/series-metadata";
import type { KillMatrixCrossTeamData, KillMatrixPivotData } from "../../../controllers/stats/kill-matrix/types";
import { PlayerPreSeriesInfo } from "../../player-pre-series-info/player-pre-series-info";
import type { LiveTrackerMatchRenderModel, LiveTrackerTeamRenderModel } from "../types";

interface KillMatrixData {
  readonly pivotData: KillMatrixPivotData;
  readonly transposedPivotData: KillMatrixPivotData;
  readonly crossTeamData: KillMatrixCrossTeamData | null;
  readonly swappedCrossTeamData: KillMatrixCrossTeamData | null;
}

interface StatsPanelContentProps {
  readonly selectedTab: number;
  readonly teams: readonly LiveTrackerTeamRenderModel[];
  readonly playersAssociationData: Record<string, PlayerAssociationData> | null;
  readonly seriesMatchCount: number;
  readonly seriesStats: {
    teamData: MatchStatsData[];
    playerData: MatchStatsData[];
    metadata: SeriesMetadata | null;
  } | null;
  readonly selectedMatchStats: MatchStatsData[] | null;
  readonly selectedMatch: LiveTrackerMatchRenderModel | null;
  readonly teamColors: TeamColor[];
  readonly gameModeIconUrl: (gameMode: string, gameVariantCategory?: number) => string;
  readonly matchKillMatrix: KillMatrixData | null;
  readonly seriesKillMatrix: KillMatrixData | null;
  readonly analyticsStatus: ComponentLoaderStatus;
}

function StatsPanelContentComponent({
  selectedTab,
  teams,
  playersAssociationData,
  seriesMatchCount,
  seriesStats,
  selectedMatchStats,
  selectedMatch,
  teamColors,
  gameModeIconUrl,
  matchKillMatrix,
  seriesKillMatrix,
  analyticsStatus,
}: StatsPanelContentProps): React.ReactElement | null {
  if (selectedTab === -1 && seriesMatchCount === 0 && playersAssociationData != null) {
    return (
      <PlayerPreSeriesInfo teams={teams} playersAssociationData={playersAssociationData} teamColors={teamColors} />
    );
  }

  if (selectedTab === -1 && seriesStats != null && seriesMatchCount > 0) {
    return (
      <SeriesStats
        teamData={seriesStats.teamData}
        playerData={seriesStats.playerData}
        title="Series Totals"
        metadata={seriesStats.metadata}
        teamColors={teamColors}
        killMatrixPivotData={seriesKillMatrix?.pivotData}
        transposedKillMatrixPivotData={seriesKillMatrix?.transposedPivotData}
        crossTeamData={seriesKillMatrix?.crossTeamData}
        swappedCrossTeamData={seriesKillMatrix?.swappedCrossTeamData}
        killMatrixStatus={analyticsStatus}
      />
    );
  }

  if (selectedTab >= 0 && selectedMatchStats != null && selectedMatch != null) {
    return (
      <MatchStatsView
        data={selectedMatchStats}
        id={selectedMatch.matchId}
        backgroundImageUrl={selectedMatch.gameMapThumbnailUrl}
        gameModeIconUrl={gameModeIconUrl(
          selectedMatch.gameType,
          selectedMatch.rawMatchStats?.MatchInfo.GameVariantCategory,
        )}
        gameModeAlt={selectedMatch.gameType}
        matchNumber={selectedTab + 1}
        gameTypeAndMap={selectedMatch.gameTypeAndMap}
        duration={selectedMatch.duration}
        score={selectedMatch.gameScore}
        startTime={selectedMatch.startTime}
        endTime={selectedMatch.endTime}
        teamColors={teamColors}
        killMatrixPivotData={matchKillMatrix?.pivotData}
        transposedKillMatrixPivotData={matchKillMatrix?.transposedPivotData}
        crossTeamData={matchKillMatrix?.crossTeamData}
        swappedCrossTeamData={matchKillMatrix?.swappedCrossTeamData}
        killMatrixStatus={analyticsStatus}
      />
    );
  }

  return null;
}

export const StatsPanelContent = memo(StatsPanelContentComponent);
