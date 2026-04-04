import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getExtractionObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";

export class ExtractionMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerExtraction>): StatsCollection {
    return new Map(getExtractionObjectiveStats(stats));
  }
}
