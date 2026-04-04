import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getStockpileObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";

export class StockpileMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerStockpile>): StatsCollection {
    return new Map(getStockpileObjectiveStats(stats));
  }
}
