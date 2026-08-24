import type { Stats } from "halo-infinite-api";

export function serializeObjectiveStats(stats: Stats): string {
  return JSON.stringify(stats, (key: string, value: unknown): unknown => {
    if (key === "CoreStats") {
      return undefined;
    }

    return value;
  });
}
