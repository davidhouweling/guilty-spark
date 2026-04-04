import type { StatsValue } from "./types.mjs";

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

  return {
    name: key,
    value: statValue,
    bestInTeam: teamBestValues.get(key) === statValue,
    bestInMatch: matchBestValues.get(key) === statValue,
    display: display ?? formatStatValue(statValue, locale),
  };
}
