import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import type { MatchStats } from "halo-infinite-api";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { TeamColor } from "../../team-colors/team-colors";
import type { TickerMatchGroup } from "../../information-ticker/information-ticker";
import { createMatchStatsFormatter } from "../../../controllers/stats/create";
import type { OverlayTab } from "../../streamer-overlay/tabs-bar";
import type { IndividualTrackerViewerRenderModel, ViewerSeriesTab, ViewerTimelineItem } from "../viewer/types";
import { gameModeIconSrc } from "../game-mode-icon";

export type MatchStatsState =
  | { readonly status: "loading" }
  | {
      readonly status: "loaded";
      readonly stats: MatchStats;
      readonly playerMap: Map<string, string>;
      readonly medalMetadata: MedalMetadata;
      readonly analytics: MatchAnalytics | null;
    }
  | { readonly status: "error"; readonly message: string };

export function getDefaultTeamColors(): [TeamColor, TeamColor] {
  return [getTeamColorOrDefault(undefined, 0), getTeamColorOrDefault(undefined, 1)];
}

export function getActiveSeries(timeline: readonly ViewerTimelineItem[]): ViewerSeriesTab | null {
  for (const item of timeline) {
    if (item.type === "series" && item.series.isActive) {
      return item.series;
    }
  }

  return null;
}

export function buildTabs(timeline: readonly ViewerTimelineItem[]): readonly OverlayTab[] {
  const activeSeries = getActiveSeries(timeline);
  if (activeSeries != null) {
    return activeSeries.matches.map(
      (match, index): OverlayTab => ({
        type: "match",
        index,
        matchId: match.matchId,
        label: match.mapName,
        score: match.score,
        icon: gameModeIconSrc(match.gameVariantCategory),
        teamColor: match.colorHex,
      }),
    );
  }

  let matchIdx = 0;
  return timeline.map((item): OverlayTab => {
    if (item.type === "series") {
      return {
        type: "series",
        seriesId: item.series.id,
        index: -1,
        label: item.series.title,
        score: item.series.score,
        teamColor: undefined,
        icons: item.series.matches.map((match) => ({
          src: gameModeIconSrc(match.gameVariantCategory),
          dimmed: false,
        })),
      };
    }
    return {
      type: "match",
      index: matchIdx++,
      matchId: item.match.matchId,
      label: item.match.mapName,
      score: item.match.score,
      icon: gameModeIconSrc(item.match.gameVariantCategory),
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
  return selectedMatchId != null && (matchStatsState?.status === "loaded" || matchStatsState?.status === "error");
}

export function buildTickerGroups(matchStatsState: MatchStatsState | null, matchIndex: number): TickerMatchGroup[] {
  if (matchStatsState?.status !== "loaded") {
    return [];
  }

  const { stats } = matchStatsState;
  const formatter = createMatchStatsFormatter(stats.MatchInfo.GameVariantCategory);
  const playerMap = new Map(stats.Players.map((p) => [getPlayerXuid(p), getPlayerXuid(p)]));
  const data = formatter.getData(stats, playerMap, {});

  return [
    {
      matchIndex,
      label: "",
      rows: data.flatMap((teamData) => [
        {
          type: "team" as const,
          teamId: teamData.teamId,
          name: getTeamName(teamData.teamId),
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
