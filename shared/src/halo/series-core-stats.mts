import type { Stats } from "halo-infinite-api";
import { getDurationInIsoString, getDurationInSeconds } from "./duration.mjs";

export function mergeCoreStats(
  existingCoreStats: Stats["CoreStats"],
  incomingCoreStats: Stats["CoreStats"],
): Stats["CoreStats"] {
  let mergedCoreStats: Stats["CoreStats"] = { ...existingCoreStats };
  for (const [key, value] of Object.entries(incomingCoreStats)) {
    const castKey = key as keyof Stats["CoreStats"];

    if (castKey === "Medals" || castKey === "PersonalScores") {
      const existingStatMap = new Map(mergedCoreStats[castKey].map((stat) => [stat.NameId, stat]));
      const castValue = value as Stats["CoreStats"]["Medals"];
      for (const statValue of castValue) {
        const existingStat = existingStatMap.get(statValue.NameId);
        if (existingStat) {
          existingStatMap.set(statValue.NameId, {
            ...existingStat,
            Count: existingStat.Count + statValue.Count,
            TotalPersonalScoreAwarded: existingStat.TotalPersonalScoreAwarded + statValue.TotalPersonalScoreAwarded,
          });
        } else {
          existingStatMap.set(statValue.NameId, statValue);
        }
      }

      mergedCoreStats = {
        ...mergedCoreStats,
        [castKey]: Array.from(existingStatMap.values()),
      };
    } else if (castKey === "AverageLifeDuration" && typeof value === "string") {
      const averageLifeDuration = mergedCoreStats[castKey];
      mergedCoreStats = {
        ...mergedCoreStats,
        [castKey]: [averageLifeDuration, value].join(","),
      };
    } else if (typeof value === "number" && typeof mergedCoreStats[castKey] === "number") {
      const oldValue = mergedCoreStats[castKey];
      mergedCoreStats = {
        ...mergedCoreStats,
        [castKey]: oldValue + value,
      };
    } else {
      throw new Error(`Invalid type for key ${key}`);
    }
  }

  return mergedCoreStats;
}

function getAccumulatedAverageLifeDuration(averageLifeDuration: string): string {
  const averageLifeDurations = averageLifeDuration.split(",");
  if (averageLifeDurations.length === 1) {
    return averageLifeDuration;
  }

  const accLifeDurationInSeconds = averageLifeDurations
    .map((duration) => getDurationInSeconds(duration))
    .reduce((a, b) => a + b, 0);
  const accAverageLifeDuration = accLifeDurationInSeconds / averageLifeDurations.length;
  return getDurationInIsoString(accAverageLifeDuration);
}

export function adjustAveragesInCoreStats(coreStats: Stats["CoreStats"], matches: number): Stats["CoreStats"] {
  return {
    ...coreStats,
    Accuracy: coreStats.Accuracy / matches,
    AverageLifeDuration: getAccumulatedAverageLifeDuration(coreStats.AverageLifeDuration),
  };
}
