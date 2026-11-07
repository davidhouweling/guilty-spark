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
