import type { StatsValueSortBy } from "./stat-formatting";

export interface StatsValue {
  value: number;
  sortBy: StatsValueSortBy;
  display?: string;
  prefix?: string;
}

export type StatsCollection = Map<string, StatsValue>;
