import React, { useCallback, useMemo } from "react";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { TickerMatchGroup } from "../../information-ticker/information-ticker";
import { createMatchStatsPresenter } from "../../stats/create";
import { StreamerOverlay } from "../../streamer-overlay/streamer-overlay";
import { TopSection } from "../../streamer-overlay/top-section";
import type { OverlayTab } from "../../streamer-overlay/tabs-bar";
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

function buildTickerGroups(matchStatsState: MatchStatsState | null, matchIndex: number): TickerMatchGroup[] {
  if (matchStatsState?.status !== "loaded") {
    return [];
  }

  const { stats } = matchStatsState;
  const presenter = createMatchStatsPresenter(stats.MatchInfo.GameVariantCategory);
  const playerMap = new Map(stats.Players.map((p) => [getPlayerXuid(p), getPlayerXuid(p)]));
  const data = presenter.getData(stats, playerMap, {});

  return [
    {
      matchIndex,
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

  const activeSeries = useMemo(() => getActiveSeries(renderModel.timeline), [renderModel.timeline]);

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

  const tabs = useMemo((): readonly OverlayTab[] => {
    let matchIdx = 0;
    return renderModel.timeline.map((item): OverlayTab => {
      if (item.type === "series") {
        return {
          type: "series",
          index: -1,
          label: item.series.title,
          score: item.series.score,
          teamColor: undefined,
        };
      }
      return {
        type: "match",
        index: matchIdx++,
        matchId: item.match.matchId,
        label: item.match.mapName,
        score: item.match.score,
        icon: "",
        teamColor: item.match.colorHex,
      };
    });
  }, [renderModel.timeline]);

  const selectedTabIndex = useMemo(() => {
    if (selectedMatchId == null) return 0;
    const tab = tabs.find((t) => t.type === "match" && t.matchId === selectedMatchId);
    return tab?.type === "match" ? tab.index : 0;
  }, [selectedMatchId, tabs]);

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
        showTabs={renderModel.timeline.length > 0}
        showTicker={true}
        showPreSeriesInfo={false}
        matchesLength={renderModel.accumulated.total}
        showPreview={false}
        previewMode="observer"
        fontSizeStyles={{}}
        settingsUi={null}
        hasPanelContent={hasPanelContent}
        renderPanelContent={renderPanelContent}
        onTabClick={handleTabClick}
        panelOpen={isPanelOpen}
        onClosePanel={onDeselect}
      />
    </div>
  );
}
