import type { GameVariantCategory, Stats } from "halo-infinite-api";
import {
  withCtfObjectiveStatDisplays,
  withInfectionObjectiveStatDisplays,
  withKothObjectiveStatDisplays,
  withOddballObjectiveStatDisplays,
  withStockpileObjectiveStatDisplays,
  withStrongholdsObjectiveStatDisplays,
  withVipObjectiveStatDisplays,
} from "./objective-stats-displays";
import {
  getCtfObjectiveStatValues,
  getInfectionObjectiveStatValues,
  getKothObjectiveStatValues,
  getOddballObjectiveStatValues,
  getStockpileObjectiveStatValues,
  getStrongholdsObjectiveStatValues,
  getVipObjectiveStatValues,
} from "./objective-stats-values";
import { StatsValueSortBy } from "./stat-formatting";
import type { StatsCollection } from "./types";

export function getEmptyObjectiveStats(): StatsCollection {
  return new Map();
}

export function getCtfObjectiveStats(
  stats: Stats<GameVariantCategory.MultiplayerCtf>,
  locale?: string,
): StatsCollection {
  return withCtfObjectiveStatDisplays(getCtfObjectiveStatValues(stats), stats, locale);
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
  return withInfectionObjectiveStatDisplays(getInfectionObjectiveStatValues(stats), stats, locale);
}

export function getOddballObjectiveStats(
  stats: Stats<GameVariantCategory.MultiplayerOddball>,
  locale?: string,
): StatsCollection {
  return withOddballObjectiveStatDisplays(getOddballObjectiveStatValues(stats), stats, locale);
}

export function getStrongholdsObjectiveStats(
  stats: Stats<GameVariantCategory.MultiplayerStrongholds>,
  locale?: string,
): StatsCollection {
  return withStrongholdsObjectiveStatDisplays(getStrongholdsObjectiveStatValues(stats), stats, locale);
}

export function getKothObjectiveStats(
  stats: Stats<GameVariantCategory.MultiplayerKingOfTheHill>,
  locale?: string,
): StatsCollection {
  return withKothObjectiveStatDisplays(getKothObjectiveStatValues(stats), stats, locale);
}

export function getStockpileObjectiveStats(
  stats: Stats<GameVariantCategory.MultiplayerStockpile>,
  locale?: string,
): StatsCollection {
  return withStockpileObjectiveStatDisplays(getStockpileObjectiveStatValues(stats), stats, locale);
}

export function getVipObjectiveStats(
  stats: Stats<GameVariantCategory.MultiplayerVIP>,
  locale?: string,
): StatsCollection {
  return withVipObjectiveStatDisplays(getVipObjectiveStatValues(stats), stats, locale);
}
