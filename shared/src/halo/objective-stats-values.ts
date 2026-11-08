import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getDurationInSeconds } from "./duration";
import { StatsValueSortBy } from "./stat-formatting";
import type { StatsCollection } from "./types";

export function getCtfObjectiveStatValues(stats: Stats<GameVariantCategory.MultiplayerCtf>): StatsCollection {
  return new Map([
    ["Captures", { value: stats.CaptureTheFlagStats.FlagCaptures, sortBy: StatsValueSortBy.DESC }],
    ["Captures assists", { value: stats.CaptureTheFlagStats.FlagCaptureAssists, sortBy: StatsValueSortBy.DESC }],
    [
      "Carrier time",
      {
        value: getDurationInSeconds(stats.CaptureTheFlagStats.TimeAsFlagCarrier),
        sortBy: StatsValueSortBy.DESC,
      },
    ],
    ["Steals", { value: stats.CaptureTheFlagStats.FlagSteals, sortBy: StatsValueSortBy.DESC }],
    ["Grabs", { value: stats.CaptureTheFlagStats.FlagGrabs, sortBy: StatsValueSortBy.DESC }],
    ["Secures", { value: stats.CaptureTheFlagStats.FlagSecures, sortBy: StatsValueSortBy.DESC }],
    ["Returns", { value: stats.CaptureTheFlagStats.FlagReturns, sortBy: StatsValueSortBy.DESC }],
    ["Carriers killed", { value: stats.CaptureTheFlagStats.FlagCarriersKilled, sortBy: StatsValueSortBy.DESC }],
    ["Returners killed", { value: stats.CaptureTheFlagStats.KillsAsFlagReturner, sortBy: StatsValueSortBy.DESC }],
    ["Kills as returner", { value: stats.CaptureTheFlagStats.KillsAsFlagReturner, sortBy: StatsValueSortBy.DESC }],
  ]);
}

export function getOddballObjectiveStatValues(stats: Stats<GameVariantCategory.MultiplayerOddball>): StatsCollection {
  return new Map([
    [
      "Total time as carrier",
      {
        value: getDurationInSeconds(stats.OddballStats.TimeAsSkullCarrier),
        sortBy: StatsValueSortBy.DESC,
      },
    ],
    [
      "Longest time as carrier",
      {
        value: getDurationInSeconds(stats.OddballStats.LongestTimeAsSkullCarrier),
        sortBy: StatsValueSortBy.DESC,
      },
    ],
  ]);
}

export function getKothObjectiveStatValues(
  stats: Stats<GameVariantCategory.MultiplayerKingOfTheHill>,
): StatsCollection {
  return new Map([
    ["Scoring ticks", { value: stats.ZonesStats.StrongholdScoringTicks, sortBy: StatsValueSortBy.DESC }],
    [
      "Occupation time",
      {
        value: getDurationInSeconds(stats.ZonesStats.StrongholdOccupationTime),
        sortBy: StatsValueSortBy.DESC,
      },
    ],
    ["Offensive kills", { value: stats.ZonesStats.StrongholdOffensiveKills, sortBy: StatsValueSortBy.DESC }],
    ["Defensive kills", { value: stats.ZonesStats.StrongholdDefensiveKills, sortBy: StatsValueSortBy.DESC }],
  ]);
}

export function getInfectionObjectiveStatValues(
  stats: Stats<GameVariantCategory.MultiplayerInfection>,
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
      },
    ],
    ["Spartans infected", { value: stats.InfectionSTats.SpartansInfected, sortBy: StatsValueSortBy.DESC }],
    [
      "Spartans infected as alpha",
      { value: stats.InfectionSTats.SpartansInfectedAsAlpha, sortBy: StatsValueSortBy.DESC },
    ],
  ]);
}

export function getStrongholdsObjectiveStatValues(
  stats: Stats<GameVariantCategory.MultiplayerStrongholds>,
): StatsCollection {
  return new Map([
    ["Captures", { value: stats.ZonesStats.StrongholdCaptures, sortBy: StatsValueSortBy.DESC }],
    [
      "Occupation time",
      {
        value: getDurationInSeconds(stats.ZonesStats.StrongholdOccupationTime),
        sortBy: StatsValueSortBy.DESC,
      },
    ],
    ["Secures", { value: stats.ZonesStats.StrongholdSecures, sortBy: StatsValueSortBy.DESC }],
    ["Offensive kills", { value: stats.ZonesStats.StrongholdOffensiveKills, sortBy: StatsValueSortBy.DESC }],
    ["Defensive kills", { value: stats.ZonesStats.StrongholdDefensiveKills, sortBy: StatsValueSortBy.DESC }],
  ]);
}

export function getStockpileObjectiveStatValues(
  stats: Stats<GameVariantCategory.MultiplayerStockpile>,
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
      },
    ],
    [
      "Time as power seed driver",
      {
        value: getDurationInSeconds(stats.StockpileStats.TimeAsPowerSeedDriver),
        sortBy: StatsValueSortBy.DESC,
      },
    ],
  ]);
}

export function getVipObjectiveStatValues(stats: Stats<GameVariantCategory.MultiplayerVIP>): StatsCollection {
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
      },
    ],
    [
      "Time as VIP",
      {
        value: getDurationInSeconds(stats.VipStats.TimeAsVip),
        sortBy: StatsValueSortBy.DESC,
      },
    ],
  ]);
}
