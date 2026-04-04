import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getStrongholdsObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";

export class KOTHMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerKingOfTheHill>): StatsCollection {
    return new Map(getStrongholdsObjectiveStats(stats));
  }
}
