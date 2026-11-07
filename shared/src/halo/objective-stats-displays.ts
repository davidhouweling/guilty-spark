import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getReadableDuration } from "./duration";
import type { StatsCollection } from "./types";

export function withCtfObjectiveStatDisplays(
  values: StatsCollection,
  stats: Stats<GameVariantCategory.MultiplayerCtf>,
  locale?: string,
): StatsCollection {
  const result = new Map(values);
  const carrierTime = result.get("Carrier time");
  if (carrierTime != null) {
    result.set("Carrier time", {
      ...carrierTime,
      display: getReadableDuration(stats.CaptureTheFlagStats.TimeAsFlagCarrier, locale),
    });
  }
  return result;
}

export function withOddballObjectiveStatDisplays(
  values: StatsCollection,
  stats: Stats<GameVariantCategory.MultiplayerOddball>,
  locale?: string,
): StatsCollection {
  const result = new Map(values);
  const totalTime = result.get("Total time as carrier");
  if (totalTime != null) {
    result.set("Total time as carrier", {
      ...totalTime,
      display: getReadableDuration(stats.OddballStats.TimeAsSkullCarrier, locale),
    });
  }
  const longestTime = result.get("Longest time as carrier");
  if (longestTime != null) {
    result.set("Longest time as carrier", {
      ...longestTime,
      display: getReadableDuration(stats.OddballStats.LongestTimeAsSkullCarrier, locale),
    });
  }
  return result;
}

export function withKothObjectiveStatDisplays(
  values: StatsCollection,
  stats: Stats<GameVariantCategory.MultiplayerKingOfTheHill>,
  locale?: string,
): StatsCollection {
  const result = new Map(values);
  const occupationTime = result.get("Occupation time");
  if (occupationTime != null) {
    result.set("Occupation time", {
      ...occupationTime,
      display: getReadableDuration(stats.ZonesStats.StrongholdOccupationTime, locale),
    });
  }
  return result;
}
