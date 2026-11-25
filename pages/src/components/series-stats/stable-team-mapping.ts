import type { SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";

export function hasStableSeriesTeamMapping(data: SeriesDetailResponse): boolean {
  if (data.aggregation.status !== "resolved" || data.matches.results.length === 0) {
    return false;
  }
  const seriesTeamIds = new Set(data.aggregation.teams.map((team) => team.seriesTeamId));
  return (
    data.aggregation.teams.length === 2 &&
    seriesTeamIds.size === 2 &&
    data.matches.results.every(
      (result) =>
        result.status === "resolved" &&
        result.detail.teams.length === 2 &&
        new Set(result.detail.teams.map((team) => team.seriesTeamId)).size === 2 &&
        result.detail.teams.every((team) => team.seriesTeamId != null && seriesTeamIds.has(team.seriesTeamId)),
    )
  );
}
