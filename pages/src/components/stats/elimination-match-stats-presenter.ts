import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getEliminationObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";

export class EliminationMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerElimination>): StatsCollection {
    return new Map(getEliminationObjectiveStats(stats));
  }
}
