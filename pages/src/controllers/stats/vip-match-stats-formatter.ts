import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getVipObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsFormatter } from "./base-match-stats-formatter";

export class VIPMatchStatsFormatter extends BaseMatchStatsFormatter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerVIP>): StatsCollection {
    return new Map(getVipObjectiveStats(stats));
  }
}
