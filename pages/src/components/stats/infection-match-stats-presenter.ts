import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getInfectionObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";

export class InfectionMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerInfection>): StatsCollection {
    return new Map(getInfectionObjectiveStats(stats));
  }
}
