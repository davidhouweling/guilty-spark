import type { SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import type { ObserverViewColorSettings } from "../live-tracker/settings/types";
import { hasStableSeriesTeamMapping } from "../series-stats/stable-team-mapping";
import { getTeamColorOrDefault } from "../team-colors/team-colors";
import type { TeamColor } from "../team-colors/team-colors";

export function presentArchiveSeriesColors(
  data: SeriesDetailResponse,
  colors: ObserverViewColorSettings,
): { readonly available: boolean; readonly teamColors: readonly TeamColor[] } {
  if (!hasStableSeriesTeamMapping(data)) {
    return { available: false, teamColors: [] };
  }
  return {
    available: true,
    teamColors: [getTeamColorOrDefault(colors.eagleColor, 0), getTeamColorOrDefault(colors.cobraColor, 1)],
  };
}
