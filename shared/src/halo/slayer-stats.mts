import type { Stats } from "halo-infinite-api";
import { Preconditions } from "../base/preconditions.mjs";
import { getDurationInSeconds, getReadableDuration } from "./duration.mjs";
import { formatDamageRatio, formatStatValue, getSafeRatioValue, StatsValueSortBy } from "./stat-formatting.mjs";

export interface SlayerStatsValue {
  value: number;
  sortBy: StatsValueSortBy;
  display?: string;
}

interface PlayerSlayerStatsOptions {
  includeRank?: boolean;
  includeScore?: boolean;
  rank?: number;
  locale?: string;
}

export function getPlayerSlayerStats(
  coreStats: Stats["CoreStats"],
  options: PlayerSlayerStatsOptions = {},
): Map<string, SlayerStatsValue> {
  const { includeRank = false, includeScore = true, rank, locale } = options;

  const slayerStats = new Map<string, SlayerStatsValue>();

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
    display: `${formatStatValue(coreStats.Accuracy, locale)}%`,
  });
  slayerStats.set("Damage dealt", { value: coreStats.DamageDealt, sortBy: StatsValueSortBy.DESC });
  slayerStats.set("Damage taken", { value: coreStats.DamageTaken, sortBy: StatsValueSortBy.ASC });
  slayerStats.set("Damage ratio", {
    value: getSafeRatioValue(coreStats.DamageDealt, coreStats.DamageTaken),
    sortBy: StatsValueSortBy.DESC,
    display: formatDamageRatio(coreStats.DamageDealt, coreStats.DamageTaken, locale),
  });
  slayerStats.set("Avg life time", {
    value: getDurationInSeconds(coreStats.AverageLifeDuration),
    sortBy: StatsValueSortBy.DESC,
    display: getReadableDuration(coreStats.AverageLifeDuration, locale),
  });
  slayerStats.set("Avg damage per life", {
    value: getSafeRatioValue(coreStats.DamageDealt, coreStats.Deaths),
    sortBy: StatsValueSortBy.DESC,
    display: formatDamageRatio(coreStats.DamageDealt, coreStats.Deaths, locale),
  });

  return slayerStats;
}
