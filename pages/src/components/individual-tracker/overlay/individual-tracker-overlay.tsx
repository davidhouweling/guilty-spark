import React, { useCallback, useMemo } from "react";
import classNames from "classnames";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { summarizeSeriesOutcome } from "@guilty-spark/shared/halo/match-enrichment";
import { createStreamerOverlaySection } from "../../streamer-overlay/create";
import { TopSection } from "../../streamer-overlay/top-section";
import { TeamDetailsContent } from "../../streamer-overlay/team-details-content";
import { StatsPanel } from "../viewer/stats-panel";
import { SeriesStatsView } from "../../series-stats/series-stats";
import { StatsHeader } from "../../stats/stats-header";
import { OutcomeBadge } from "../../outcome-badge/outcome-badge";
import { Alert } from "../../alert/alert";
import { LoadingState } from "../../loading-state/loading-state";
import { gameModeIconSrc } from "../game-mode-icon";
import { buildSeriesHeaderMetadata, seriesHeaderBackgroundStyle } from "../stats-panel-header";
import { useRotatingBackgroundTick } from "../use-rotating-background-tick";
import type { MatchDetailsState, SeriesDetailsState, ViewerMatchTab, ViewerSeriesTab } from "../viewer/types";
import { OverlayStatsHighlights } from "./overlay-stats-highlights";
import { MATCHMAKING_SUMMARY_TAB_SERIES_ID } from "./types";
import type { IndividualTrackerOverlayViewModel } from "./types";
import styles from "./individual-tracker-overlay.module.css";

interface IndividualTrackerOverlayProps {
  readonly viewModel: IndividualTrackerOverlayViewModel;
  readonly isPanelOpen: boolean;
  readonly matchesLength: number;
  readonly matchStatsPanelState: MatchDetailsState | null;
  readonly seriesStatsPanelState: SeriesDetailsState | null;
  readonly selectedMatch: ViewerMatchTab | null;
  readonly selectedSeries: ViewerSeriesTab | null;
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
  selectedMatch,
  selectedSeries,
  selectedMatchId,
  selectedSeriesId,
  showPreview = false,
  previewMode = "observer",
  onSelectMatch,
  onSelectSeries,
  onDeselect,
}: IndividualTrackerOverlayProps): React.ReactElement {
  const StreamerOverlaySection = useMemo(() => createStreamerOverlaySection(), []);
  const {
    tick: seriesBackgroundTick,
    isTransitioning: isSeriesBackgroundTransitioning,
    isGlitching: isSeriesBackgroundGlitching,
  } = useRotatingBackgroundTick();

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
        if (selectedTab.seriesId === MATCHMAKING_SUMMARY_TAB_SERIES_ID) {
          onDeselect();
          return;
        }

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
    (tabIndex: number): boolean => {
      const selectedTab = viewModel.tabs.find((tab) => tab.index === tabIndex);
      if (selectedTab?.type === "series" && selectedTab.seriesId === MATCHMAKING_SUMMARY_TAB_SERIES_ID) {
        return false;
      }

      return selectedTab != null;
    },
    [viewModel.tabs],
  );

  const renderPanelContent = useCallback(
    (tabIndex: number): React.ReactElement | null => {
      const selectedTab = viewModel.tabs.find((currentTab) => currentTab.index === tabIndex);

      if (selectedTab?.type === "series") {
        if (selectedTab.seriesId === MATCHMAKING_SUMMARY_TAB_SERIES_ID && seriesStatsPanelState == null) {
          return <StatsPanel match={selectedMatch} state={matchStatsPanelState} />;
        }

        if (seriesStatsPanelState == null) {
          return null;
        }

        let seriesBody: React.ReactElement;
        switch (seriesStatsPanelState.status) {
          case "loading": {
            seriesBody = <LoadingState text="Loading series stats..." />;
            break;
          }
          case "error": {
            seriesBody = <Alert variant="error">{seriesStatsPanelState.message}</Alert>;
            break;
          }
          case "loaded": {
            seriesBody = <SeriesStatsView {...seriesStatsPanelState.viewModel} noGutter={true} />;
            break;
          }
          default: {
            throw new UnreachableError(seriesStatsPanelState);
          }
        }

        return (
          <div className={styles.seriesPanel}>
            {selectedSeries != null && (
              <StatsHeader
                title={selectedSeries.title}
                subtitle={selectedSeries.subtitle}
                metadata={buildSeriesHeaderMetadata(selectedSeries)}
                backgroundStyle={seriesHeaderBackgroundStyle(
                  selectedSeries.matchBackgroundUrls,
                  seriesBackgroundTick,
                  isSeriesBackgroundTransitioning,
                  isSeriesBackgroundGlitching,
                )}
                rightContent={
                  <div className={styles.headerVisuals}>
                    <div className={styles.seriesModeIcons}>
                      {selectedSeries.iconMatches.map((seriesMatch, iconIndex) => (
                        <img
                          key={`${seriesMatch.matchId}:${iconIndex.toString()}`}
                          src={gameModeIconSrc(seriesMatch.gameVariantCategory)}
                          alt={seriesMatch.gameModeName}
                          className={classNames(styles.headerModeIcon, {
                            [styles.seriesModeIconMuted]: seriesMatch.outcome === "Loss",
                          })}
                        />
                      ))}
                    </div>
                    <OutcomeBadge
                      outcome={
                        selectedSeries.isActive
                          ? "In progress"
                          : summarizeSeriesOutcome(selectedSeries.matches.map((seriesMatch) => seriesMatch.outcome))
                      }
                    />
                  </div>
                }
              />
            )}
            {seriesBody}
          </div>
        );
      }

      return <StatsPanel match={selectedMatch} state={matchStatsPanelState} />;
    },
    [
      matchStatsPanelState,
      seriesStatsPanelState,
      selectedMatch,
      selectedSeries,
      seriesBackgroundTick,
      isSeriesBackgroundTransitioning,
      isSeriesBackgroundGlitching,
      viewModel.tabs,
    ],
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
      <StreamerOverlaySection
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
