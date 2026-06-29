import React, { useCallback, useMemo } from "react";
import { StreamerOverlay } from "../../streamer-overlay/streamer-overlay";
import { TopSection } from "../../streamer-overlay/top-section";
import { StatsPanel } from "../viewer/stats-panel";
import type { IndividualTrackerViewerRenderModel, MatchDetailsState } from "../viewer/types";
import type { MatchStatsState } from "./individual-tracker-overlay-presenter";
import {
  buildTabs,
  buildTickerGroups,
  getActiveSeries,
  getDefaultTeamColors,
  getSelectedTabIndex,
  getShowTabs,
  isPanelOpen as computeIsPanelOpen,
} from "./individual-tracker-overlay-presenter";
import { OverlayStatsHighlights } from "./overlay-stats-highlights";
import styles from "./individual-tracker-overlay.module.css";

interface IndividualTrackerOverlayProps {
  readonly renderModel: IndividualTrackerViewerRenderModel;
  readonly matchStatsState: MatchStatsState | null;
  readonly matchStatsPanelState: MatchDetailsState | null;
  readonly selectedMatchId: string | null;
  readonly onSelectMatch: (matchId: string) => void;
  readonly onDeselect: () => void;
}

export function IndividualTrackerOverlay({
  renderModel,
  matchStatsState,
  matchStatsPanelState,
  selectedMatchId,
  onSelectMatch,
  onDeselect,
}: IndividualTrackerOverlayProps): React.ReactElement {
  const isPanelOpen = computeIsPanelOpen(selectedMatchId, matchStatsState);

  const teamColors = useMemo(() => getDefaultTeamColors(), []);

  const activeSeries = useMemo(() => getActiveSeries(renderModel.timeline), [renderModel.timeline]);

  const topSection = useMemo(() => {
    const seriesSection =
      activeSeries != null ? (
        <TopSection
          title={activeSeries.title}
          subtitle={activeSeries.subtitle}
          iconUrl={null}
          showScore={true}
          seriesScore={activeSeries.score}
          showTeamDetails={false}
          teamColors={teamColors}
          teamLeft={null}
          teamRight={null}
        />
      ) : null;
    const statsSection =
      renderModel.statsHighlights != null && renderModel.statsHighlights.length > 0 ? (
        <OverlayStatsHighlights items={renderModel.statsHighlights} />
      ) : null;
    if (seriesSection == null && statsSection == null) {
      return null;
    }
    return (
      <>
        {seriesSection}
        {statsSection}
      </>
    );
  }, [activeSeries, teamColors, renderModel.statsHighlights]);

  const tabs = useMemo(() => buildTabs(renderModel.timeline), [renderModel.timeline]);

  const selectedTabIndex = useMemo(() => getSelectedTabIndex(tabs, selectedMatchId), [tabs, selectedMatchId]);

  const tickerMatchGroups = useMemo(
    () => buildTickerGroups(matchStatsState, selectedTabIndex),
    [matchStatsState, selectedTabIndex],
  );

  const handleTabClick = useCallback(
    (tabIndex: number): void => {
      if (tabIndex === -1) {
        onDeselect();
        return;
      }
      const tab = tabs.find((t) => t.type === "match" && t.index === tabIndex);
      if (tab?.type === "match") {
        if (tab.matchId === selectedMatchId) {
          onDeselect();
        } else {
          onSelectMatch(tab.matchId);
        }
      }
    },
    [onDeselect, onSelectMatch, selectedMatchId, tabs],
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
          "--overlay-team-color": teamColors[0].hex,
          "--overlay-enemy-color": teamColors[1].hex,
        } as React.CSSProperties
      }
    >
      <StreamerOverlay
        topSection={topSection}
        pinTopSection={activeSeries != null}
        teamColors={teamColors}
        tabs={tabs}
        tickerMatchGroups={tickerMatchGroups}
        showTabs={getShowTabs(renderModel)}
        showTicker={true}
        showPreSeriesInfo={false}
        matchesLength={renderModel.accumulated.total}
        showPreview={false}
        previewMode="observer"
        fontSizeStyles={{}}
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
