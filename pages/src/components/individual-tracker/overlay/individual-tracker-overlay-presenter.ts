import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { TeamColor } from "../../team-colors/team-colors";
import type { TickerMatchGroup } from "../../information-ticker/information-ticker";
import { createMatchStatsPresenter } from "../../stats/create";
import type { OverlayTab } from "../../streamer-overlay/tabs-bar";
import type { IndividualTrackerViewerRenderModel, ViewerSeriesTab, ViewerTimelineItem } from "../viewer/types";
import type { MatchStatsState } from "../viewer/viewer-store";

export function getDefaultTeamColors(): [TeamColor, TeamColor] {
  return [getTeamColorOrDefault(undefined, 0), getTeamColorOrDefault(undefined, 1)];
}

export function getActiveSeries(timeline: readonly ViewerTimelineItem[]): ViewerSeriesTab | null {
  const last = timeline.at(-1);
  if (last?.type === "series") {
    return last.series;
  }
  return null;
}

export function buildTabs(timeline: readonly ViewerTimelineItem[]): readonly OverlayTab[] {
  let matchIdx = 0;
  return timeline.map((item): OverlayTab => {
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
}

export function getSelectedTabIndex(tabs: readonly OverlayTab[], selectedMatchId: string | null): number {
  if (selectedMatchId == null) {
    return 0;
  }
  const tab = tabs.find((t) => t.type === "match" && t.matchId === selectedMatchId);
  return tab?.type === "match" ? tab.index : 0;
}

export function isPanelOpen(selectedMatchId: string | null, matchStatsState: MatchStatsState | null): boolean {
  return (
    selectedMatchId != null &&
    (matchStatsState?.status === "loaded" || matchStatsState?.status === "error")
  );
}

export function buildTickerGroups(matchStatsState: MatchStatsState | null, matchIndex: number): TickerMatchGroup[] {
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

export function getShowTabs(renderModel: IndividualTrackerViewerRenderModel): boolean {
  return renderModel.timeline.length > 0;
}
