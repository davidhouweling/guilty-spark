import type { GameVariantCategory } from "halo-infinite-api";
import type { EmbedPlayerStats, PlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed, StatsValueSortBy } from "./base-match-embed.mjs";

export class StockpileMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerStockpile> {
  override getPlayerObjectiveStats(stats: PlayerStats<GameVariantCategory.MultiplayerStockpile>): EmbedPlayerStats {
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
          value: this.haloService.getDurationInSeconds(stats.StockpileStats.TimeAsPowerSeedCarrier),
          sortBy: StatsValueSortBy.DESC,
          display: this.haloService.getReadableDuration(stats.StockpileStats.TimeAsPowerSeedCarrier),
        },
      ],
      [
        "Time as power seed driver",
        {
          value: this.haloService.getDurationInSeconds(stats.StockpileStats.TimeAsPowerSeedDriver),
          sortBy: StatsValueSortBy.DESC,
          display: this.haloService.getReadableDuration(stats.StockpileStats.TimeAsPowerSeedDriver),
        },
      ],
    ]);
  }
}
