import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getStrongholdsObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsFormatter } from "./base-match-stats-formatter";

export class KOTHMatchStatsFormatter extends BaseMatchStatsFormatter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerKingOfTheHill>): StatsCollection {
    return new Map(getStrongholdsObjectiveStats(stats));
  }
}
