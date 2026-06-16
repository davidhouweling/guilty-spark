import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getOddballObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsFormatter } from "./base-match-stats-formatter";

export class OddballMatchStatsFormatter extends BaseMatchStatsFormatter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerOddball>): StatsCollection {
    return new Map(getOddballObjectiveStats(stats));
  }
}
