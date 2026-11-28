import type React from "react";
import { memo } from "react";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { PlayerAssociationData } from "@guilty-spark/shared/live-tracker/types";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import type { TeamColor } from "../../team-colors/team-colors";
import { MatchStats as MatchStatsView } from "../../stats/match-stats";
import { SeriesStats } from "../../stats/series-stats";
import type { MatchStatsData } from "../../../controllers/stats/types";
import type { SeriesMetadata } from "../../../controllers/stats/series-metadata";
import type { KillMatrixCrossTeamData, KillMatrixPivotData } from "../../../controllers/stats/kill-matrix/types";
import { PlayerPreSeriesInfo } from "../../player-pre-series-info/player-pre-series-info";
import { Alert } from "../../alert/alert";
import { Button } from "../../button/button";
import { LoadingState } from "../../loading-state/loading-state";
import type { LiveTrackerMatchRenderModel, LiveTrackerTeamRenderModel } from "../types";
import type { SeriesStatsViewModel } from "../../series-stats/types";

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
  readonly isCapturedPreSeries: boolean;
  readonly preSeriesStatus: ComponentLoaderStatus;
  readonly preSeriesError: string | null;
  readonly onRetryPreSeries: () => void;
  readonly seriesMatchCount: number;
  readonly seriesStats: {
    teamData: MatchStatsData[];
    playerData: MatchStatsData[];
    metadata: SeriesMetadata | null;
  } | null;
  readonly selectedMatchStats: MatchStatsData[] | null;
  readonly selectedMatch: LiveTrackerMatchRenderModel | null;
  readonly teamColors: readonly TeamColor[];
  readonly gameModeIconUrl: (gameMode: string, gameVariantCategory?: number) => string;
  readonly matchKillMatrix: KillMatrixData | null;
  readonly seriesKillMatrix: KillMatrixData | null;
  readonly analyticsStatus: ComponentLoaderStatus;
  readonly detailStatus: ComponentLoaderStatus;
  readonly hasRetainedDetail: boolean;
  readonly detailError: string | null;
  readonly detailWarning: SeriesStatsViewModel["seriesStatsWarning"];
  readonly onRetryDetails: () => void;
  readonly matchKillMatrixStatus: ComponentLoaderStatus;
  readonly onAnalyticsTabSelected: (module: AnalyticsModule, matchId?: string) => void;
}

function StatsPanelContentComponent({
  selectedTab,
  teams,
  playersAssociationData,
  isCapturedPreSeries,
  preSeriesStatus,
  preSeriesError,
  onRetryPreSeries,
  seriesMatchCount,
  seriesStats,
  selectedMatchStats,
  selectedMatch,
  teamColors,
  gameModeIconUrl,
  matchKillMatrix,
  seriesKillMatrix,
  analyticsStatus,
  detailStatus,
  hasRetainedDetail,
  detailError,
  detailWarning,
  onRetryDetails,
  matchKillMatrixStatus,
  onAnalyticsTabSelected,
}: StatsPanelContentProps): React.ReactElement | null {
  if (selectedTab === -1 && seriesMatchCount === 0 && isCapturedPreSeries) {
    if (preSeriesStatus === ComponentLoaderStatus.ERROR) {
      const error = (
        <Alert variant="warning">
          {preSeriesError ?? "Captured player info is unavailable."}{" "}
          <Button variant="secondary" size="small" onClick={onRetryPreSeries}>
            Retry
          </Button>
        </Alert>
      );
      return playersAssociationData == null ? (
        error
      ) : (
        <>
          {error}
          <PlayerPreSeriesInfo
            teams={teams}
            playersAssociationData={playersAssociationData}
            teamColors={teamColors}
            fullWidth
          />
        </>
      );
    }
    if (preSeriesStatus !== ComponentLoaderStatus.LOADED) {
      const loading = <LoadingState text="Loading captured player info..." />;
      return playersAssociationData == null ? (
        loading
      ) : (
        <>
          {loading}
          <PlayerPreSeriesInfo
            teams={teams}
            playersAssociationData={playersAssociationData}
            teamColors={teamColors}
            fullWidth
          />
        </>
      );
    }
    if (playersAssociationData == null) {
      return (
        <Alert variant="warning">
          Captured player info is unavailable.{" "}
          <Button variant="secondary" size="small" onClick={onRetryPreSeries}>
            Retry
          </Button>
        </Alert>
      );
    }
    return (
      <PlayerPreSeriesInfo
        teams={teams}
        playersAssociationData={playersAssociationData}
        teamColors={teamColors}
        fullWidth
      />
    );
  }

  if (detailStatus === ComponentLoaderStatus.ERROR && !hasRetainedDetail) {
    return (
      <Alert variant="warning">
        {detailError ?? "Unable to load series stats"}{" "}
        <Button variant="secondary" size="small" onClick={onRetryDetails}>
          Retry
        </Button>
      </Alert>
    );
  }
  if (detailStatus === ComponentLoaderStatus.LOADING && !hasRetainedDetail) {
    return <LoadingState text="Loading match details..." />;
  }
  const retainedDetailError =
    detailStatus === ComponentLoaderStatus.ERROR ? (
      <Alert variant="warning">
        {detailError ?? "Unable to load series stats"}{" "}
        <Button variant="secondary" size="small" onClick={onRetryDetails}>
          Retry
        </Button>
      </Alert>
    ) : null;
  const withDetailError = (content: React.ReactElement): React.ReactElement => (
    <>
      {retainedDetailError}
      {content}
    </>
  );

  if (selectedTab === -1 && seriesMatchCount === 0 && playersAssociationData != null) {
    return withDetailError(
      <PlayerPreSeriesInfo
        teams={teams}
        playersAssociationData={playersAssociationData}
        teamColors={teamColors}
        fullWidth
      />,
    );
  }

  if (selectedTab === -1 && seriesStats != null && seriesMatchCount > 0) {
    return withDetailError(
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
        onAnalyticsTabSelected={onAnalyticsTabSelected}
      />,
    );
  }

  if (selectedTab === -1 && detailWarning != null) {
    return withDetailError(<Alert variant="warning">{detailWarning}</Alert>);
  }

  if (selectedTab >= 0 && selectedMatchStats != null && selectedMatch != null) {
    return withDetailError(
      <MatchStatsView
        key={selectedMatch.matchId}
        data={selectedMatchStats}
        id={selectedMatch.matchId}
        backgroundImageUrl={selectedMatch.gameMapThumbnailUrl}
        gameModeIconUrl={gameModeIconUrl(selectedMatch.gameType, selectedMatch.gameInfo?.gameVariantCategory)}
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
        killMatrixStatus={matchKillMatrixStatus}
        onAnalyticsTabSelected={(module): void => {
          onAnalyticsTabSelected(module, selectedMatch.matchId);
        }}
      />,
    );
  }

  if (selectedTab >= 0 && selectedMatch != null) {
    return withDetailError(<Alert variant="warning">Match stats unavailable</Alert>);
  }

  return retainedDetailError;
}

export const StatsPanelContent = memo(StatsPanelContentComponent);
