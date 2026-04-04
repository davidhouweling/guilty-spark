import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getOddballObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";

export class OddballMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerOddball>): StatsCollection {
    return new Map(getOddballObjectiveStats(stats));
  }
}
