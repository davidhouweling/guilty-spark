import type { Stats } from "halo-infinite-api";

export function serializeObjectiveStats(stats: Stats): string {
  const { CoreStats, ...objectiveStats } = stats;
  void CoreStats;
  return JSON.stringify(objectiveStats);
}
