import React, { useCallback, useMemo } from "react";
import { StreamerOverlay } from "../../streamer-overlay/streamer-overlay";
import { TopSection } from "../../streamer-overlay/top-section";
import { StatsPanel } from "../viewer/stats-panel";
import type { MatchDetailsState } from "../viewer/types";
import { OverlayStatsHighlights } from "./overlay-stats-highlights";
import type { IndividualTrackerOverlayViewModel } from "./types";
import styles from "./individual-tracker-overlay.module.css";

interface IndividualTrackerOverlayProps {
  readonly viewModel: IndividualTrackerOverlayViewModel;
  readonly isPanelOpen: boolean;
  readonly matchesLength: number;
  readonly matchStatsPanelState: MatchDetailsState | null;
  readonly selectedMatchId: string | null;
  readonly onSelectMatch: (matchId: string) => void;
  readonly onDeselect: () => void;
}

export function IndividualTrackerOverlay({
  viewModel,
  isPanelOpen,
  matchesLength,
  matchStatsPanelState,
  selectedMatchId,
  onSelectMatch,
  onDeselect,
}: IndividualTrackerOverlayProps): React.ReactElement {
  const topSection = useMemo(() => {
    if (viewModel.topSection != null) {
      return (
        <TopSection
          title={viewModel.topSection.title}
          subtitle={viewModel.topSection.subtitle}
          iconUrl={null}
          showScore={viewModel.topSection.showScore}
          seriesScore={viewModel.topSection.seriesScore}
          showTeamDetails={viewModel.topSection.showTeamDetails}
          teamColors={viewModel.teamColors}
          teamLeft={
            viewModel.topSection.teamLeft != null ? (
              <>
                <div>{viewModel.topSection.teamLeft.name}</div>
                {viewModel.topSection.teamLeft.players.map((player, index) => (
                  <div key={`left-${index.toString()}`}>{player}</div>
                ))}
              </>
            ) : null
          }
          teamRight={
            viewModel.topSection.teamRight != null ? (
              <>
                <div>{viewModel.topSection.teamRight.name}</div>
                {viewModel.topSection.teamRight.players.map((player, index) => (
                  <div key={`right-${index.toString()}`}>{player}</div>
                ))}
              </>
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
      if (tabIndex < 0) {
        onDeselect();
        return;
      }
      const tab = viewModel.tabs.find((t) => t.type === "match" && t.index === tabIndex);
      if (tab?.type === "match") {
        if (tab.matchId === selectedMatchId) {
          onDeselect();
        } else {
          onSelectMatch(tab.matchId);
        }
      }
    },
    [onDeselect, onSelectMatch, selectedMatchId, viewModel.tabs],
  );

  const hasPanelContent = useCallback((): boolean => false, []);

  const renderPanelContent = useCallback(
    (): React.ReactElement | null => <StatsPanel state={matchStatsPanelState} />,
    [matchStatsPanelState],
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
        showPreSeriesInfo={viewModel.showPreSeriesInfo}
        matchesLength={matchesLength}
        showPreview={false}
        previewMode="observer"
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
