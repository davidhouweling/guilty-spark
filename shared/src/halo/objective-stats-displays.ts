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

export function withInfectionObjectiveStatDisplays(
  values: StatsCollection,
  stats: Stats<GameVariantCategory.MultiplayerInfection>,
  locale?: string,
): StatsCollection {
  const result = new Map(values);
  const timeAsLastSpartanStanding = result.get("Time as last spartan standing");
  if (timeAsLastSpartanStanding != null) {
    result.set("Time as last spartan standing", {
      ...timeAsLastSpartanStanding,
      display: getReadableDuration(stats.InfectionSTats.TimeAsLastSpartanStanding, locale),
    });
  }
  return result;
}

export function withStrongholdsObjectiveStatDisplays(
  values: StatsCollection,
  stats: Stats<GameVariantCategory.MultiplayerStrongholds>,
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

export function withStockpileObjectiveStatDisplays(
  values: StatsCollection,
  stats: Stats<GameVariantCategory.MultiplayerStockpile>,
  locale?: string,
): StatsCollection {
  const result = new Map(values);
  const timeAsPowerSeedCarrier = result.get("Time as power seed carrier");
  if (timeAsPowerSeedCarrier != null) {
    result.set("Time as power seed carrier", {
      ...timeAsPowerSeedCarrier,
      display: getReadableDuration(stats.StockpileStats.TimeAsPowerSeedCarrier, locale),
    });
  }
  const timeAsPowerSeedDriver = result.get("Time as power seed driver");
  if (timeAsPowerSeedDriver != null) {
    result.set("Time as power seed driver", {
      ...timeAsPowerSeedDriver,
      display: getReadableDuration(stats.StockpileStats.TimeAsPowerSeedDriver, locale),
    });
  }
  return result;
}

export function withVipObjectiveStatDisplays(
  values: StatsCollection,
  stats: Stats<GameVariantCategory.MultiplayerVIP>,
  locale?: string,
): StatsCollection {
  const result = new Map(values);
  const longestTimeAsVip = result.get("Longest Time as VIP");
  if (longestTimeAsVip != null) {
    result.set("Longest Time as VIP", {
      ...longestTimeAsVip,
      display: getReadableDuration(stats.VipStats.LongestTimeAsVip, locale),
    });
  }
  const timeAsVip = result.get("Time as VIP");
  if (timeAsVip != null) {
    result.set("Time as VIP", {
      ...timeAsVip,
      display: getReadableDuration(stats.VipStats.TimeAsVip, locale),
    });
  }
  return result;
}
