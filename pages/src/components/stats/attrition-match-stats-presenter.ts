import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";

export class AttritionMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(): StatsCollection {
    return new Map([]);
  }
}
