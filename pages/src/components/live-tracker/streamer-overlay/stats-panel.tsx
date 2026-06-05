import React, { memo } from "react";
import type { PlayerAssociationData } from "@guilty-spark/shared/live-tracker/types";
import type { TeamColor } from "../../team-colors/team-colors";
import { MatchStats as MatchStatsView } from "../../stats/match-stats";
import { SeriesStats } from "../../stats/series-stats";
import type { MatchStatsData } from "../../stats/types";
import type { SeriesMetadata } from "../../stats/series-metadata";
import { PlayerPreSeriesInfo } from "../../player-pre-series-info/player-pre-series-info";
import type { LiveTrackerMatchRenderModel, LiveTrackerTeamRenderModel } from "../types";

interface StatsPanelContentProps {
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

function StatsPanelContentComponent({
  selectedTab,
  teams,
  playersAssociationData,
  matchesLength,
  seriesStats,
  selectedMatchStats,
  selectedMatch,
  teamColors,
  gameModeIconUrl,
}: StatsPanelContentProps): React.ReactElement | null {
  if (selectedTab === -1 && matchesLength === 0 && playersAssociationData != null) {
    return (
      <PlayerPreSeriesInfo teams={teams} playersAssociationData={playersAssociationData} teamColors={teamColors} />
    );
  }

  if (selectedTab === -1 && seriesStats != null && matchesLength > 0) {
    return (
      <SeriesStats
        teamData={seriesStats.teamData}
        playerData={seriesStats.playerData}
        title="Series Totals"
        metadata={seriesStats.metadata}
        teamColors={teamColors}
      />
    );
  }

  if (selectedTab >= 0 && selectedMatchStats != null && selectedMatch != null) {
    return (
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
    );
  }

  return null;
}

export const StatsPanelContent = memo(StatsPanelContentComponent);
