import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getCtfObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";

export class CtfMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerCtf>): StatsCollection {
    return new Map(getCtfObjectiveStats(stats));
  }
}
