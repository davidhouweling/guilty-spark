import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { Stat, Medal } from "@guilty-spark/shared/contracts/stats/detail-primitives";
import { getDurationInIsoString, getReadableDuration } from "@guilty-spark/shared/halo/duration";
import type { MedalEntry } from "@guilty-spark/shared/halo/medals";
import { formatStatValue, StatsValueSortBy } from "@guilty-spark/shared/halo/stat-formatting";
import type { MatchStatsValues } from "../../controllers/stats/types";

type DetailStat = Stat;
type DetailMedal = Medal;

export class DetailStatsFormatter {
  constructor(private readonly locale?: string) {}

  getBestValues(stats: DetailStat[]): Map<string, number> {
    const bestValues = new Map<string, number>();
    for (const stat of stats) {
      if (!stat.isComparable || stat.status === "unavailable") {
        continue;
      }
      const value = this.getNumericValue(stat);
      const best = bestValues.get(stat.key);
      if (best === undefined || this.isBetter(value, best, stat.sortBy)) {
        bestValues.set(stat.key, value);
      }
    }
    return bestValues;
  }

  private isBetter(value: number, best: number, sortBy: DetailStat["sortBy"]): boolean {
    switch (sortBy) {
      case StatsValueSortBy.ASC: {
        return value < best;
      }
      case StatsValueSortBy.DESC: {
        return value > best;
      }
      default: {
        throw new UnreachableError(sortBy);
      }
    }
  }

  presentStat(stat: DetailStat, bestInTeam: Map<string, number>, bestInMatch: Map<string, number>): MatchStatsValues {
    const value = this.getNumericValue(stat);
    const comparable = stat.isComparable && stat.status !== "unavailable";
    return {
      key: stat.key,
      name: stat.name,
      value,
      display: this.getDisplay(stat),
      bestInTeam: comparable && bestInTeam.get(stat.key) === value,
      bestInMatch: comparable && bestInMatch.get(stat.key) === value,
    };
  }

  private getNumericValue(stat: DetailStat): number {
    switch (stat.status) {
      case "available": {
        return stat.value;
      }
      case "unbounded": {
        return Number.POSITIVE_INFINITY;
      }
      case "unavailable": {
        return Number.NaN;
      }
      default: {
        throw new UnreachableError(stat);
      }
    }
  }

  private getDisplay(stat: DetailStat): string {
    switch (stat.status) {
      case "unavailable": {
        return "n/a";
      }
      case "unbounded": {
        return `${stat.prefix ?? ""}♾️`;
      }
      case "available": {
        return `${stat.prefix ?? ""}${this.formatAvailableValue(stat)}`;
      }
      default: {
        throw new UnreachableError(stat);
      }
    }
  }

  private formatAvailableValue(stat: Extract<DetailStat, { status: "available" }>): string {
    const { format } = stat;
    switch (format) {
      case "number":
      case "ratio": {
        return formatStatValue(stat.value, this.locale);
      }
      case "percentage": {
        const fraction = stat.percentage?.scale === "fraction" ? stat.value : stat.value / 100;
        return fraction.toLocaleString(this.locale, {
          style: "percent",
          maximumFractionDigits: stat.percentage?.maximumFractionDigits ?? 2,
        });
      }
      case "duration-seconds": {
        return getReadableDuration(getDurationInIsoString(Math.floor(stat.value)), this.locale);
      }
      default: {
        throw new UnreachableError(format);
      }
    }
  }

  presentMedals(medals: DetailMedal[]): MedalEntry[] {
    return medals
      .map((medal) => ({
        name: medal.name ?? medal.id.toString(),
        count: medal.count,
        sortingWeight: medal.sortingWeight ?? 0,
      }))
      .sort((a, b) => b.sortingWeight - a.sortingWeight);
  }
}
