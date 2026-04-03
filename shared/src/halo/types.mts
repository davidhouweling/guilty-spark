import type { StatsValueSortBy } from "./stat-formatting.mjs";

export interface StatsValue {
  value: number;
  sortBy: StatsValueSortBy;
  display?: string;
}

export type StatsCollection = Map<string, StatsValue>;
