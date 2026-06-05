import React, { useCallback, useMemo } from "react";
import { StreamerOverlay } from "../../streamer-overlay/streamer-overlay";
import { TopSection } from "../../streamer-overlay/top-section";
import { StatsPanel } from "../viewer/stats-panel";
import type { IndividualTrackerViewerRenderModel } from "../viewer/types";
import type { MatchStatsState } from "../viewer/viewer-store";
import { IndividualTrackerOverlayPresenter } from "./individual-tracker-overlay-presenter";
import styles from "./individual-tracker-overlay.module.css";

interface IndividualTrackerOverlayProps {
  readonly renderModel: IndividualTrackerViewerRenderModel;
  readonly matchStatsState: MatchStatsState | null;
  readonly selectedMatchId: string | null;
  readonly onSelectMatch: (matchId: string) => void;
  readonly onDeselect: () => void;
}

export function IndividualTrackerOverlay({
  renderModel,
  matchStatsState,
  selectedMatchId,
  onSelectMatch,
  onDeselect,
}: IndividualTrackerOverlayProps): React.ReactElement {
  const isPanelOpen = IndividualTrackerOverlayPresenter.isPanelOpen(selectedMatchId, matchStatsState);

  const teamColors = useMemo(() => IndividualTrackerOverlayPresenter.getDefaultTeamColors(), []);

  const activeSeries = useMemo(
    () => IndividualTrackerOverlayPresenter.getActiveSeries(renderModel.timeline),
    [renderModel.timeline],
  );

  const topSection = useMemo(
    () =>
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
      ) : null,
    [activeSeries, teamColors],
  );

  const tabs = useMemo(
    () => IndividualTrackerOverlayPresenter.buildTabs(renderModel.timeline),
    [renderModel.timeline],
  );

  const selectedTabIndex = useMemo(
    () => IndividualTrackerOverlayPresenter.getSelectedTabIndex(tabs, selectedMatchId),
    [tabs, selectedMatchId],
  );

  const tickerMatchGroups = useMemo(
    () => IndividualTrackerOverlayPresenter.buildTickerGroups(matchStatsState, selectedTabIndex),
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

  const hasPanelContent = useCallback((_tabIndex: number): boolean => false, []);

  const renderPanelContent = useCallback(
    (_tabIndex: number): React.ReactElement | null => <StatsPanel state={matchStatsState} />,
    [matchStatsState],
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
        showTabs={IndividualTrackerOverlayPresenter.getShowTabs(renderModel)}
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
