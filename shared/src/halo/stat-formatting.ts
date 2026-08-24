import type { StatsValue } from "./types";

export enum StatsValueSortBy {
  ASC,
  DESC,
}

export interface ResolvedStatsValue {
  name: string;
  value: number;
  bestInTeam: boolean;
  bestInMatch: boolean;
  display: string;
}

export function formatStatValue(statValue: number, locale?: string): string {
  return Number.isSafeInteger(statValue)
    ? statValue.toLocaleString(locale)
    : Number(statValue.toFixed(2)).toLocaleString(locale);
}

export function getSafeRatioValue(numerator: number, denominator: number): number {
  if (numerator === 0) {
    return 0;
  }

  if (denominator === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return numerator / denominator;
}

// Non-finite ratios (e.g. a flawless game with zero damage taken) can't be stored in a NOT NULL REAL column.
export function clampRatioForStorage(value: number): number {
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

export function formatDamageRatio(damageDealt: number, damageTaken: number, locale?: string): string {
  if (damageDealt === 0) {
    return "0";
  }

  if (damageTaken === 0) {
    return "♾️";
  }

  return formatStatValue(damageDealt / damageTaken, locale);
}

export function resolveStatsValue(
  matchBestValues: Map<string, number>,
  teamBestValues: Map<string, number>,
  key: string,
  value: StatsValue,
  locale?: string,
): ResolvedStatsValue {
  const { value: statValue, display } = value;
  const isComparable = value.isComparable ?? true;

  return {
    name: key,
    value: statValue,
    bestInTeam: isComparable && teamBestValues.get(key) === statValue,
    bestInMatch: isComparable && matchBestValues.get(key) === statValue,
    display: display ?? formatStatValue(statValue, locale),
  };
}
