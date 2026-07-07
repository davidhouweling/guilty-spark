import React, { useCallback, useMemo } from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { StreamerOverlay } from "../../streamer-overlay/streamer-overlay";
import { TopSection } from "../../streamer-overlay/top-section";
import { TeamDetailsContent } from "../../streamer-overlay/team-details-content";
import { StatsPanel } from "../viewer/stats-panel";
import { SeriesStatsView } from "../../series-stats/series-stats";
import { Alert } from "../../alert/alert";
import { LoadingState } from "../../loading-state/loading-state";
import type { MatchDetailsState, SeriesDetailsState } from "../viewer/types";
import { OverlayStatsHighlights } from "./overlay-stats-highlights";
import type { IndividualTrackerOverlayViewModel } from "./types";
import styles from "./individual-tracker-overlay.module.css";

interface IndividualTrackerOverlayProps {
  readonly viewModel: IndividualTrackerOverlayViewModel;
  readonly isPanelOpen: boolean;
  readonly matchesLength: number;
  readonly matchStatsPanelState: MatchDetailsState | null;
  readonly seriesStatsPanelState: SeriesDetailsState | null;
  readonly selectedMatchId: string | null;
  readonly selectedSeriesId: string | null;
  readonly showPreview?: boolean;
  readonly previewMode?: "player" | "observer";
  readonly onSelectMatch: (matchId: string) => void;
  readonly onSelectSeries: (seriesId: string) => void;
  readonly onDeselect: () => void;
}

export function IndividualTrackerOverlay({
  viewModel,
  isPanelOpen,
  matchesLength,
  matchStatsPanelState,
  seriesStatsPanelState,
  selectedMatchId,
  selectedSeriesId,
  showPreview = false,
  previewMode = "observer",
  onSelectMatch,
  onSelectSeries,
  onDeselect,
}: IndividualTrackerOverlayProps): React.ReactElement {
  const topSection = useMemo(() => {
    if (viewModel.topSection != null) {
      return (
        <TopSection
          title={viewModel.topSection.title}
          subtitle={viewModel.topSection.subtitle}
          iconUrl={viewModel.topSection.iconUrl}
          showScore={viewModel.topSection.showScore}
          seriesScore={viewModel.topSection.seriesScore}
          showTeamDetails={viewModel.topSection.showTeamDetails}
          teamColors={viewModel.teamColors}
          teamLeft={
            viewModel.topSection.teamLeft != null ? (
              <TeamDetailsContent
                team={{
                  players: viewModel.topSection.teamLeft.players.map((player) => ({
                    id: player.key,
                    displayName: player.label,
                  })),
                }}
                teamName={viewModel.topSection.teamLeft.name}
                disableTeamPlayerNames={viewModel.topSection.disableTeamPlayerNames}
                renderPlayerNameContent={(_playerId, displayName): React.ReactElement => <>{displayName}</>}
              />
            ) : null
          }
          teamRight={
            viewModel.topSection.teamRight != null ? (
              <TeamDetailsContent
                team={{
                  players: viewModel.topSection.teamRight.players.map((player) => ({
                    id: player.key,
                    displayName: player.label,
                  })),
                }}
                teamName={viewModel.topSection.teamRight.name}
                disableTeamPlayerNames={viewModel.topSection.disableTeamPlayerNames}
                renderPlayerNameContent={(_playerId, displayName): React.ReactElement => <>{displayName}</>}
              />
            ) : null
          }
        />
      );
    }

    if (viewModel.statsHighlights.length === 0) {
      return null;
    }

    return <OverlayStatsHighlights items={viewModel.statsHighlights} />;
  }, [viewModel]);

  const handleTabClick = useCallback(
    (tabIndex: number): void => {
      const selectedTab = viewModel.tabs.find((currentTab) => currentTab.index === tabIndex);
      if (selectedTab == null) {
        return;
      }

      if (selectedTab.type === "series") {
        if (selectedTab.seriesId === selectedSeriesId) {
          onDeselect();
        } else {
          onSelectSeries(selectedTab.seriesId);
        }
        return;
      }

      if (selectedTab.matchId === selectedMatchId) {
        onDeselect();
      } else {
        onSelectMatch(selectedTab.matchId);
      }
    },
    [onDeselect, onSelectMatch, onSelectSeries, selectedMatchId, selectedSeriesId, viewModel.tabs],
  );

  const hasPanelContent = useCallback(
    (tabIndex: number): boolean => viewModel.tabs.some((tab) => tab.index === tabIndex),
    [viewModel.tabs],
  );

  const renderPanelContent = useCallback(
    (tabIndex: number): React.ReactElement | null => {
      const selectedTab = viewModel.tabs.find((currentTab) => currentTab.index === tabIndex);

      if (selectedTab?.type === "series") {
        if (seriesStatsPanelState == null) {
          return null;
        }

        switch (seriesStatsPanelState.status) {
          case "loading": {
            return <LoadingState text="Loading series stats..." />;
          }
          case "error": {
            return <Alert variant="error">{seriesStatsPanelState.message}</Alert>;
          }
          case "loaded": {
            return <SeriesStatsView {...seriesStatsPanelState.viewModel} noGutter={true} />;
          }
          default: {
            throw new UnreachableError(seriesStatsPanelState);
          }
        }
      }

      return <StatsPanel state={matchStatsPanelState} />;
    },
    [matchStatsPanelState, seriesStatsPanelState, viewModel.tabs],
  );

  return (
    <div
      className={styles.overlayRoot}
      style={
        {
          "--overlay-team-color": viewModel.teamColors[0]?.hex,
          "--overlay-enemy-color": viewModel.teamColors[1]?.hex,
        } as React.CSSProperties
      }
    >
      <StreamerOverlay
        topSection={topSection}
        pinTopSection={viewModel.pinTopSection}
        teamColors={viewModel.teamColors}
        tabs={viewModel.tabs}
        tickerMatchGroups={viewModel.tickerMatchGroups}
        showTabs={viewModel.showTabs}
        showTicker={viewModel.showTicker}
        matchesLength={matchesLength}
        showPreview={showPreview}
        previewMode={previewMode}
        fontSizeStyles={viewModel.fontSizeStyles}
        settingsUi={null}
        hasPanelContent={hasPanelContent}
        renderPanelContent={renderPanelContent}
        panelOpen={isPanelOpen}
        onTabClick={handleTabClick}
        onClosePanel={onDeselect}
      />
    </div>
  );
}
