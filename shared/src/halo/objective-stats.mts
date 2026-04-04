import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getDurationInSeconds, getReadableDuration } from "./duration.mjs";
import { StatsValueSortBy } from "./stat-formatting.mjs";
import type { StatsCollection } from "./types.mjs";

export function getEmptyObjectiveStats(): StatsCollection {
  return new Map();
}

export function getCtfObjectiveStats(
  stats: Stats<GameVariantCategory.MultiplayerCtf>,
  locale?: string,
): StatsCollection {
  return new Map([
    ["Captures", { value: stats.CaptureTheFlagStats.FlagCaptures, sortBy: StatsValueSortBy.DESC }],
    ["Captures assists", { value: stats.CaptureTheFlagStats.FlagCaptureAssists, sortBy: StatsValueSortBy.DESC }],
    [
      "Carrier time",
      {
        value: getDurationInSeconds(stats.CaptureTheFlagStats.TimeAsFlagCarrier),
        sortBy: StatsValueSortBy.DESC,
        display: getReadableDuration(stats.CaptureTheFlagStats.TimeAsFlagCarrier, locale),
      },
    ],
    ["Grabs", { value: stats.CaptureTheFlagStats.FlagGrabs, sortBy: StatsValueSortBy.DESC }],
    ["Returns", { value: stats.CaptureTheFlagStats.FlagReturns, sortBy: StatsValueSortBy.DESC }],
    ["Carriers killed", { value: stats.CaptureTheFlagStats.FlagCarriersKilled, sortBy: StatsValueSortBy.DESC }],
  ]);
}

export function getEliminationObjectiveStats(
  stats: Stats<GameVariantCategory.MultiplayerElimination | GameVariantCategory.MultiplayerFirefight>,
): StatsCollection {
  return new Map([
    ["Eliminations", { value: stats.EliminationStats.Eliminations, sortBy: StatsValueSortBy.DESC }],
    ["Elimination assists", { value: stats.EliminationStats.EliminationAssists, sortBy: StatsValueSortBy.DESC }],
    ["Allies revived", { value: stats.EliminationStats.AlliesRevived, sortBy: StatsValueSortBy.DESC }],
    ["Rounds Survived", { value: stats.EliminationStats.RoundsSurvived, sortBy: StatsValueSortBy.DESC }],
    ["Times revived by ally", { value: stats.EliminationStats.TimesRevivedByAlly, sortBy: StatsValueSortBy.ASC }],
    ["Enemy revives denied", { value: stats.EliminationStats.EnemyRevivesDenied, sortBy: StatsValueSortBy.DESC }],
  ]);
}

export function getFirefightObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerFirefight>): StatsCollection {
  return new Map([
    ...getEliminationObjectiveStats(stats),
    ["Boss kills", { value: stats.PveStats.BossKills, sortBy: StatsValueSortBy.DESC }],
    ["Hunter kills", { value: stats.PveStats.HunterKills, sortBy: StatsValueSortBy.DESC }],
    ["Elite kills", { value: stats.PveStats.EliteKills, sortBy: StatsValueSortBy.DESC }],
    ["Jackal kills", { value: stats.PveStats.JackalKills, sortBy: StatsValueSortBy.DESC }],
    ["Grunt kills", { value: stats.PveStats.GruntKills, sortBy: StatsValueSortBy.DESC }],
    ["Brute kills", { value: stats.PveStats.BruteKills, sortBy: StatsValueSortBy.DESC }],
    ["Sentinel kills", { value: stats.PveStats.SentinelKills, sortBy: StatsValueSortBy.DESC }],
    ["Skimmer kills", { value: stats.PveStats.SkimmerKills, sortBy: StatsValueSortBy.DESC }],
  ]);
}

interface ExtractionObjectiveStatsOptions {
  includeExtractionPrefixInLabels?: boolean;
}

export function getExtractionObjectiveStats(
  stats: Stats<GameVariantCategory.MultiplayerExtraction>,
  options: ExtractionObjectiveStatsOptions = {},
): StatsCollection {
  const { includeExtractionPrefixInLabels = false } = options;

  return new Map([
    ["Successful extractions", { value: stats.ExtractionStats.SuccessfulExtractions, sortBy: StatsValueSortBy.DESC }],
    [
      includeExtractionPrefixInLabels ? "Extraction initiations completed" : "Initiations completed",
      {
        value: stats.ExtractionStats.ExtractionInitiationsCompleted,
        sortBy: StatsValueSortBy.DESC,
      },
    ],
    [
      includeExtractionPrefixInLabels ? "Extraction initiations denied" : "Initiations denied",
      {
        value: stats.ExtractionStats.ExtractionInitiationsDenied,
        sortBy: StatsValueSortBy.DESC,
      },
    ],
    [
      includeExtractionPrefixInLabels ? "Extraction conversions completed" : "Conversions completed",
      {
        value: stats.ExtractionStats.ExtractionConversionsCompleted,
        sortBy: StatsValueSortBy.DESC,
      },
    ],
    [
      includeExtractionPrefixInLabels ? "Extraction conversions denied" : "Conversions denied",
      {
        value: stats.ExtractionStats.ExtractionConversionsDenied,
        sortBy: StatsValueSortBy.DESC,
      },
    ],
  ]);
}

export function getInfectionObjectiveStats(
  stats: Stats<GameVariantCategory.MultiplayerInfection>,
  locale?: string,
): StatsCollection {
  return new Map([
    ["Alphas killed", { value: stats.InfectionSTats.AlphasKilled, sortBy: StatsValueSortBy.DESC }],
    ["Infected killed", { value: stats.InfectionSTats.InfectedKilled, sortBy: StatsValueSortBy.DESC }],
    [
      "Kills as last spartan standing",
      { value: stats.InfectionSTats.KillsAsLastSpartanStanding, sortBy: StatsValueSortBy.DESC },
    ],
    [
      "Rounds survived as spartan",
      { value: stats.InfectionSTats.RoundsSurvivedAsSpartan, sortBy: StatsValueSortBy.DESC },
    ],
    [
      "Time as last spartan standing",
      {
        value: getDurationInSeconds(stats.InfectionSTats.TimeAsLastSpartanStanding),
        sortBy: StatsValueSortBy.DESC,
        display: getReadableDuration(stats.InfectionSTats.TimeAsLastSpartanStanding, locale),
      },
    ],
    ["Spartans infected", { value: stats.InfectionSTats.SpartansInfected, sortBy: StatsValueSortBy.DESC }],
    [
      "Spartans infected as alpha",
      { value: stats.InfectionSTats.SpartansInfectedAsAlpha, sortBy: StatsValueSortBy.DESC },
    ],
  ]);
}

export function getOddballObjectiveStats(
  stats: Stats<GameVariantCategory.MultiplayerOddball>,
  locale?: string,
): StatsCollection {
  return new Map([
    [
      "Total time as carrier",
      {
        value: getDurationInSeconds(stats.OddballStats.TimeAsSkullCarrier),
        sortBy: StatsValueSortBy.DESC,
        display: getReadableDuration(stats.OddballStats.TimeAsSkullCarrier, locale),
      },
    ],
    [
      "Longest time as carrier",
      {
        value: getDurationInSeconds(stats.OddballStats.LongestTimeAsSkullCarrier),
        sortBy: StatsValueSortBy.DESC,
        display: getReadableDuration(stats.OddballStats.LongestTimeAsSkullCarrier, locale),
      },
    ],
  ]);
}

export function getStrongholdsObjectiveStats(
  stats: Stats<GameVariantCategory.MultiplayerStrongholds | GameVariantCategory.MultiplayerKingOfTheHill>,
  locale?: string,
): StatsCollection {
  return new Map([
    ["Captures", { value: stats.ZonesStats.StrongholdCaptures, sortBy: StatsValueSortBy.DESC }],
    [
      "Occupation time",
      {
        value: getDurationInSeconds(stats.ZonesStats.StrongholdOccupationTime),
        sortBy: StatsValueSortBy.DESC,
        display: getReadableDuration(stats.ZonesStats.StrongholdOccupationTime, locale),
      },
    ],
    ["Secures", { value: stats.ZonesStats.StrongholdSecures, sortBy: StatsValueSortBy.DESC }],
    ["Offensive kills", { value: stats.ZonesStats.StrongholdOffensiveKills, sortBy: StatsValueSortBy.DESC }],
    ["Defensive kills", { value: stats.ZonesStats.StrongholdDefensiveKills, sortBy: StatsValueSortBy.DESC }],
  ]);
}

export function getStockpileObjectiveStats(
  stats: Stats<GameVariantCategory.MultiplayerStockpile>,
  locale?: string,
): StatsCollection {
  return new Map([
    ["Power seeds deposited", { value: stats.StockpileStats.PowerSeedsDeposited, sortBy: StatsValueSortBy.DESC }],
    ["Power seeds stolen", { value: stats.StockpileStats.PowerSeedsStolen, sortBy: StatsValueSortBy.DESC }],
    [
      "Kills as power seed carrier",
      { value: stats.StockpileStats.KillsAsPowerSeedCarrier, sortBy: StatsValueSortBy.DESC },
    ],
    [
      "Power seed carriers killed",
      { value: stats.StockpileStats.PowerSeedCarriersKilled, sortBy: StatsValueSortBy.DESC },
    ],
    [
      "Time as power seed carrier",
      {
        value: getDurationInSeconds(stats.StockpileStats.TimeAsPowerSeedCarrier),
        sortBy: StatsValueSortBy.DESC,
        display: getReadableDuration(stats.StockpileStats.TimeAsPowerSeedCarrier, locale),
      },
    ],
    [
      "Time as power seed driver",
      {
        value: getDurationInSeconds(stats.StockpileStats.TimeAsPowerSeedDriver),
        sortBy: StatsValueSortBy.DESC,
        display: getReadableDuration(stats.StockpileStats.TimeAsPowerSeedDriver, locale),
      },
    ],
  ]);
}

export function getVipObjectiveStats(
  stats: Stats<GameVariantCategory.MultiplayerVIP>,
  locale?: string,
): StatsCollection {
  return new Map([
    ["VIP kills", { value: stats.VipStats.VipKills, sortBy: StatsValueSortBy.DESC }],
    ["VIP Assists", { value: stats.VipStats.VipAssists, sortBy: StatsValueSortBy.DESC }],
    ["Kills as VIP", { value: stats.VipStats.KillsAsVip, sortBy: StatsValueSortBy.DESC }],
    ["Times selected as VIP", { value: stats.VipStats.TimesSelectedAsVip, sortBy: StatsValueSortBy.DESC }],
    ["Max killing spree as VIP", { value: stats.VipStats.MaxKillingSpreeAsVip, sortBy: StatsValueSortBy.DESC }],
    [
      "Longest Time as VIP",
      {
        value: getDurationInSeconds(stats.VipStats.LongestTimeAsVip),
        sortBy: StatsValueSortBy.DESC,
        display: getReadableDuration(stats.VipStats.LongestTimeAsVip, locale),
      },
    ],
    [
      "Time as VIP",
      {
        value: getDurationInSeconds(stats.VipStats.TimeAsVip),
        sortBy: StatsValueSortBy.DESC,
        display: getReadableDuration(stats.VipStats.TimeAsVip, locale),
      },
    ],
  ]);
}
