import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { UnreachableError } from "../base/unreachable-error";
import { getDurationInSeconds } from "./duration";

export enum ObjectiveTimeSource {
  FlagCarrier = "FLAG_CARRIER",
  ZoneOccupation = "ZONE_OCCUPATION",
  SkullCarrier = "SKULL_CARRIER",
}

export const ObjectiveGameVariantCategory = {
  Strongholds: 11,
  KingOfTheHill: 12,
  TotalControl: 14,
  CaptureTheFlag: 15,
  Oddball: 18,
} as const;

const OBJECTIVE_TIME_SOURCES = new Map<number, ObjectiveTimeSource>([
  [ObjectiveGameVariantCategory.CaptureTheFlag, ObjectiveTimeSource.FlagCarrier],
  [ObjectiveGameVariantCategory.Strongholds, ObjectiveTimeSource.ZoneOccupation],
  [ObjectiveGameVariantCategory.KingOfTheHill, ObjectiveTimeSource.ZoneOccupation],
  [ObjectiveGameVariantCategory.TotalControl, ObjectiveTimeSource.ZoneOccupation],
  [ObjectiveGameVariantCategory.Oddball, ObjectiveTimeSource.SkullCarrier],
]);

export function getObjectiveTimeSource(category: GameVariantCategory): ObjectiveTimeSource | null {
  return OBJECTIVE_TIME_SOURCES.get(category) ?? null;
}

export function getObjectiveTimeSeconds(category: GameVariantCategory, stats: Stats): number | null {
  const source = getObjectiveTimeSource(category);
  if (source == null) {
    return null;
  }

  switch (source) {
    case ObjectiveTimeSource.FlagCarrier: {
      if (!("CaptureTheFlagStats" in stats)) {
        return null;
      }
      return getDurationInSeconds(stats.CaptureTheFlagStats.TimeAsFlagCarrier);
    }
    case ObjectiveTimeSource.ZoneOccupation: {
      if (!("ZonesStats" in stats)) {
        return null;
      }
      return getDurationInSeconds(stats.ZonesStats.StrongholdOccupationTime);
    }
    case ObjectiveTimeSource.SkullCarrier: {
      if (!("OddballStats" in stats)) {
        return null;
      }
      return getDurationInSeconds(stats.OddballStats.TimeAsSkullCarrier);
    }
    default: {
      throw new UnreachableError(source);
    }
  }
}