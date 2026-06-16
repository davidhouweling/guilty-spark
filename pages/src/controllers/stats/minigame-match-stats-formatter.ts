import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsFormatter } from "./base-match-stats-formatter";

export class MinigameMatchStatsFormatter extends BaseMatchStatsFormatter {
  protected getPlayerObjectiveStats(): StatsCollection {
    return new Map([]);
  }
}
