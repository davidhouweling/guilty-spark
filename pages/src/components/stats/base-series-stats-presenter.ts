import type { MatchStats, Stats } from "halo-infinite-api";
import { aggregatePlayerCoreStats as aggregateSharedPlayerCoreStats } from "@guilty-spark/shared/halo/series-player";

export abstract class BaseSeriesStatsPresenter {
  protected aggregatePlayerCoreStats(matches: MatchStats[]): Map<string, Stats["CoreStats"]> {
    return aggregateSharedPlayerCoreStats(matches);
  }
}
