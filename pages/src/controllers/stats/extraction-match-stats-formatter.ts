import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getExtractionObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsFormatter } from "./base-match-stats-formatter";

export class ExtractionMatchStatsFormatter extends BaseMatchStatsFormatter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerExtraction>): StatsCollection {
    return new Map(getExtractionObjectiveStats(stats));
  }
}
