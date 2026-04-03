import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getDurationInSeconds, getReadableDuration } from "@guilty-spark/shared/halo/duration";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed, StatsValueSortBy } from "./base-match-embed.mjs";

export class StockpileMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerStockpile> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerStockpile>): EmbedPlayerStats {
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
          value: getDurationInSeconds(stats.StockpileStats.TimeAsPowerSeedCarrier),
          sortBy: StatsValueSortBy.DESC,
          display: getReadableDuration(stats.StockpileStats.TimeAsPowerSeedCarrier, this.locale),
        },
      ],
      [
        "Time as power seed driver",
        {
          value: getDurationInSeconds(stats.StockpileStats.TimeAsPowerSeedDriver),
          sortBy: StatsValueSortBy.DESC,
          display: getReadableDuration(stats.StockpileStats.TimeAsPowerSeedDriver, this.locale),
        },
      ],
    ]);
  }
}
