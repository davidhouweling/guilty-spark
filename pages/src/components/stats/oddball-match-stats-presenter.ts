import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";
import type { StatsCollection } from "./types";
import { StatsValueSortBy } from "./types";

export class OddballMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerOddball>): StatsCollection {
    return new Map([
      [
        "Total time as carrier",
        {
          value: this.getDurationInSeconds(stats.OddballStats.TimeAsSkullCarrier),
          sortBy: StatsValueSortBy.DESC,
          display: this.getReadableDuration(stats.OddballStats.TimeAsSkullCarrier),
        },
      ],
      [
        "Longest time as carrier",
        {
          value: this.getDurationInSeconds(stats.OddballStats.LongestTimeAsSkullCarrier),
          sortBy: StatsValueSortBy.DESC,
          display: this.getReadableDuration(stats.OddballStats.LongestTimeAsSkullCarrier),
        },
      ],
    ]);
  }
}
