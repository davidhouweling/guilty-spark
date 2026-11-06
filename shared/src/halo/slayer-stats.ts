import type { Stats } from "halo-infinite-api";
import { Preconditions } from "../base/preconditions";
import { getDurationInSeconds, getReadableDuration } from "./duration";
import { formatDamageRatio, formatStatValue, getSafeRatioValue, StatsValueSortBy } from "./stat-formatting";
import type { StatsCollection } from "./types";

interface PlayerSlayerStatsOptions {
  includeRank?: boolean;
  includeScore?: boolean;
  rank?: number;
  locale?: string;
}

export function getPlayerSlayerStatValues(
  coreStats: Stats["CoreStats"],
  options: PlayerSlayerStatsOptions = {},
): StatsCollection {
  const { includeRank = false, includeScore = true, rank } = options;

  const slayerStats: StatsCollection = new Map();

  if (includeRank) {
    slayerStats.set("Rank", {
      value: Preconditions.checkExists(rank, "Rank is required when includeRank is true"),
      sortBy: StatsValueSortBy.ASC,
    });
  }

  if (includeScore) {
    slayerStats.set("Score", { value: coreStats.PersonalScore, sortBy: StatsValueSortBy.DESC });
  }

  slayerStats.set("Kills", { value: coreStats.Kills, sortBy: StatsValueSortBy.DESC });
  slayerStats.set("Deaths", { value: coreStats.Deaths, sortBy: StatsValueSortBy.ASC });
  slayerStats.set("Assists", { value: coreStats.Assists, sortBy: StatsValueSortBy.DESC });
  slayerStats.set("KDA", { value: coreStats.KDA, sortBy: StatsValueSortBy.DESC });
  slayerStats.set("Headshot kills", { value: coreStats.HeadshotKills, sortBy: StatsValueSortBy.DESC });
  slayerStats.set("Shots hit", { value: coreStats.ShotsHit, sortBy: StatsValueSortBy.DESC });
  slayerStats.set("Shots fired", { value: coreStats.ShotsFired, sortBy: StatsValueSortBy.DESC });
  slayerStats.set("Accuracy", {
    value: coreStats.Accuracy,
    sortBy: StatsValueSortBy.DESC,
  });
  slayerStats.set("Damage dealt", { value: coreStats.DamageDealt, sortBy: StatsValueSortBy.DESC });
  slayerStats.set("Damage taken", { value: coreStats.DamageTaken, sortBy: StatsValueSortBy.ASC });
  slayerStats.set("Damage ratio", {
    value: getSafeRatioValue(coreStats.DamageDealt, coreStats.DamageTaken),
    sortBy: StatsValueSortBy.DESC,
  });
  slayerStats.set("Avg life time", {
    value: getDurationInSeconds(coreStats.AverageLifeDuration),
    sortBy: StatsValueSortBy.DESC,
  });
  slayerStats.set("Avg damage per life", {
    value: getSafeRatioValue(coreStats.DamageDealt, coreStats.Deaths + 1),
    sortBy: StatsValueSortBy.DESC,
  });

  return slayerStats;
}

export function withPlayerSlayerStatDisplays(
  values: StatsCollection,
  coreStats: Stats["CoreStats"],
  locale?: string,
): StatsCollection {
  const result = new Map(values);
  const displays = new Map([
    ["Accuracy", `${formatStatValue(coreStats.Accuracy, locale)}%`],
    ["Damage ratio", formatDamageRatio(coreStats.DamageDealt, coreStats.DamageTaken, locale)],
    ["Avg life time", getReadableDuration(coreStats.AverageLifeDuration, locale)],
    ["Avg damage per life", formatDamageRatio(coreStats.DamageDealt, coreStats.Deaths + 1, locale)],
  ]);
  for (const [key, display] of displays) {
    const value = result.get(key);
    if (value && value.display == null) {
      result.set(key, { ...value, display });
    }
  }
  return result;
}

export function getPlayerSlayerStats(
  coreStats: Stats["CoreStats"],
  options: PlayerSlayerStatsOptions = {},
): StatsCollection {
  return withPlayerSlayerStatDisplays(getPlayerSlayerStatValues(coreStats, options), coreStats, options.locale);
}
