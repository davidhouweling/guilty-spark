import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";
import type { StatsCollection } from "./types";
import { StatsValueSortBy } from "./types";

export class StockpileMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerStockpile>): StatsCollection {
    return new Map([
      ["Power seeds deposited", { value: stats.StockpileStats.PowerSeedsDeposited, sortBy: StatsValueSortBy.DESC }],
      ["Power seeds stolen", { value: stats.StockpileStats.PowerSeedsStolen, sortBy: StatsValueSortBy.DESC }],
      [
        "Kills as power seed carrier",
        { value: stats.StockpileStats.KillsAsPowerSeedCarrier, sortBy: StatsValueSortBy.DESC },
      ],
      [
        "Power seed carriers killed",
        { value: stats.StockpileStats.PowerSeedCarriersKilled, sortBy: StatsValueSortBy.DESC },
      ],
      [
        "Time as power seed carrier",
        {
          value: this.getDurationInSeconds(stats.StockpileStats.TimeAsPowerSeedCarrier),
          sortBy: StatsValueSortBy.DESC,
          display: this.getReadableDuration(stats.StockpileStats.TimeAsPowerSeedCarrier),
        },
      ],
      [
        "Time as power seed driver",
        {
          value: this.getDurationInSeconds(stats.StockpileStats.TimeAsPowerSeedDriver),
          sortBy: StatsValueSortBy.DESC,
          display: this.getReadableDuration(stats.StockpileStats.TimeAsPowerSeedDriver),
        },
      ],
    ]);
  }
}
