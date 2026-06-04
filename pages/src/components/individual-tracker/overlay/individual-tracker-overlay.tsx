import React, { useCallback, useMemo } from "react";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { TickerMatchGroup } from "../../information-ticker/information-ticker";
import { createMatchStatsPresenter } from "../../stats/create";
import { StreamerOverlay } from "../../streamer-overlay/streamer-overlay";
import { TopSection } from "../../streamer-overlay/top-section";
import { TabsBar } from "../viewer/viewer-tabs";
import { StatsPanel } from "../viewer/stats-panel";
import type { IndividualTrackerViewerRenderModel, ViewerSeriesTab, ViewerTimelineItem } from "../viewer/types";
import type { MatchStatsState } from "../viewer/viewer-store";
import styles from "./individual-tracker-overlay.module.css";

interface IndividualTrackerOverlayProps {
  readonly renderModel: IndividualTrackerViewerRenderModel;
  readonly matchStatsState: MatchStatsState | null;
  readonly selectedMatchId: string | null;
  readonly onSelectMatch: (matchId: string) => void;
  readonly onDeselect: () => void;
}

function getActiveSeries(timeline: readonly ViewerTimelineItem[]): ViewerSeriesTab | null {
  const last = timeline.at(-1);
  if (last?.type === "series") {
    return last.series;
  }
  return null;
}

function buildTickerGroups(matchStatsState: MatchStatsState | null): TickerMatchGroup[] {
  if (matchStatsState?.status !== "loaded") {
    return [];
  }

  const { stats } = matchStatsState;
  const presenter = createMatchStatsPresenter(stats.MatchInfo.GameVariantCategory);
  const playerMap = new Map(stats.Players.map((p) => [getPlayerXuid(p), getPlayerXuid(p)]));
  const data = presenter.getData(stats, playerMap, {});

  return [
    {
      matchIndex: 0,
      label: "",
      rows: data.flatMap((teamData) => [
        {
          type: "team" as const,
          teamId: teamData.teamId,
          name: `Team ${teamData.teamId.toString()}`,
          stats: teamData.teamStats,
          medals: teamData.teamMedals,
        },
        ...teamData.players.map((p) => ({
          type: "player" as const,
          teamId: teamData.teamId,
          name: p.name,
          stats: p.values,
          medals: p.medals,
        })),
      ]),
    },
  ];
}

export function IndividualTrackerOverlay({
  renderModel,
  matchStatsState,
  selectedMatchId,
  onSelectMatch,
  onDeselect,
}: IndividualTrackerOverlayProps): React.ReactElement {
  const isPanelOpen =
    selectedMatchId != null && (matchStatsState?.status === "loaded" || matchStatsState?.status === "error");

  const teamColors = useMemo(() => [getTeamColorOrDefault(undefined, 0), getTeamColorOrDefault(undefined, 1)], []);

  const activeSeries = getActiveSeries(renderModel.timeline);

  const topSection =
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

  const tickerMatchGroups = useMemo(() => buildTickerGroups(matchStatsState), [matchStatsState]);

  const renderPanelContent = useCallback((): React.ReactElement | null => {
    if (matchStatsState == null) {
      return null;
    }
    return <StatsPanel state={matchStatsState} />;
  }, [matchStatsState]);

  const tabsBarSlot = useMemo(
    () => (
      <TabsBar
        timeline={renderModel.timeline}
        selectedMatchId={selectedMatchId}
        onSelectMatch={onSelectMatch}
        onDeselect={onDeselect}
      />
    ),
    [renderModel.timeline, selectedMatchId, onSelectMatch, onDeselect],
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
        tabsBarSlot={tabsBarSlot}
        tickerMatchGroups={tickerMatchGroups}
        showTabs={renderModel.timeline.length > 0}
        showTicker={true}
        showPreSeriesInfo={false}
        matchesLength={renderModel.accumulated.total}
        showPreview={false}
        previewMode="observer"
        fontSizeStyles={{}}
        settingsUi={null}
        panelOpen={isPanelOpen}
        onClosePanel={onDeselect}
        renderPanelContent={renderPanelContent}
      />
    </div>
  );
}
