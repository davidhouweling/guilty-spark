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
