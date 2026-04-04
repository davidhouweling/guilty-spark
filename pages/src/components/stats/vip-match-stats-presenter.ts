import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getVipObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";

export class VIPMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerVIP>): StatsCollection {
    return new Map(getVipObjectiveStats(stats));
  }
}
