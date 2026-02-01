import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";
import type { StatsCollection } from "./types";

export class UnknownMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(): StatsCollection {
    return new Map([]);
  }
}
