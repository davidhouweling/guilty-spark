import type { SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import type { ObserverViewColorSettings } from "../live-tracker/settings/types";
import { getTeamColorOrDefault } from "../team-colors/team-colors";
import type { TeamColor } from "../team-colors/team-colors";

function hasStableTeamSlots(data: SeriesDetailResponse): boolean {
  if (data.aggregation.status !== "resolved" || data.matches.results.length === 0) {
    return false;
  }
  const ids = new Set(data.aggregation.teams.map((team) => team.seriesTeamId));
  return (
    ids.size === 2 &&
    data.aggregation.teams.length === 2 &&
    data.matches.results.every(
      (result) =>
        result.status === "resolved" &&
        result.detail.teams.length === 2 &&
        new Set(result.detail.teams.map((team) => team.seriesTeamId)).size === 2 &&
        result.detail.teams.every((team) => team.seriesTeamId != null && ids.has(team.seriesTeamId)),
    )
  );
}

export function presentArchiveSeriesColors(
  data: SeriesDetailResponse,
  colors: ObserverViewColorSettings,
): { readonly available: boolean; readonly teamColors: readonly TeamColor[] } {
  if (!hasStableTeamSlots(data)) {
    return { available: false, teamColors: [] };
  }
  return {
    available: true,
    teamColors: [getTeamColorOrDefault(colors.eagleColor, 0), getTeamColorOrDefault(colors.cobraColor, 1)],
  };
}
