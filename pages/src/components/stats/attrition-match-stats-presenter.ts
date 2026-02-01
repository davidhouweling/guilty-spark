import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";
import type { StatsCollection } from "./types";

export class AttritionMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(): StatsCollection {
    return new Map([]);
  }
}
