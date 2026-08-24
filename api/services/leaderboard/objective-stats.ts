import type { Stats } from "halo-infinite-api";

export function serializeObjectiveStats(stats: Stats): string {
  const objectiveStats = Object.fromEntries(Object.entries(stats).filter(([key]) => key !== "CoreStats"));
  return JSON.stringify(objectiveStats);
}
