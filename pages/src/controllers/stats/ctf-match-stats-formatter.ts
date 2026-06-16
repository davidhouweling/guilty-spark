import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getCtfObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsFormatter } from "./base-match-stats-formatter";

export class CtfMatchStatsFormatter extends BaseMatchStatsFormatter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerCtf>): StatsCollection {
    return new Map(getCtfObjectiveStats(stats));
  }
}
