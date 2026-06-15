import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getInfectionObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsFormatter } from "./base-match-stats-presenter";

export class InfectionMatchStatsFormatter extends BaseMatchStatsFormatter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerInfection>): StatsCollection {
    return new Map(getInfectionObjectiveStats(stats));
  }
}
