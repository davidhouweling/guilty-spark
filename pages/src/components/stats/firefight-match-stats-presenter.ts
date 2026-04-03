import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getFirefightObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";

export class FirefightMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerFirefight>): StatsCollection {
    return new Map(getFirefightObjectiveStats(stats));
  }
}
