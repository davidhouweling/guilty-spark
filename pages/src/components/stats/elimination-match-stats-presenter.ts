import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";
import type { StatsCollection } from "./types";
import { StatsValueSortBy } from "./types";

export class EliminationMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerElimination>): StatsCollection {
    return new Map([
      ["Eliminations", { value: stats.EliminationStats.Eliminations, sortBy: StatsValueSortBy.DESC }],
      ["Elimination assists", { value: stats.EliminationStats.EliminationAssists, sortBy: StatsValueSortBy.DESC }],
      ["Allies revived", { value: stats.EliminationStats.AlliesRevived, sortBy: StatsValueSortBy.DESC }],
      ["Rounds Survived", { value: stats.EliminationStats.RoundsSurvived, sortBy: StatsValueSortBy.DESC }],
      ["Times revived by ally", { value: stats.EliminationStats.TimesRevivedByAlly, sortBy: StatsValueSortBy.ASC }],
      ["Enemy revives denied", { value: stats.EliminationStats.EnemyRevivesDenied, sortBy: StatsValueSortBy.DESC }],
    ]);
  }
}
