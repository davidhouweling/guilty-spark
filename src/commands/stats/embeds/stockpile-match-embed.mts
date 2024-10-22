import { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed, PlayerStats } from "./base-match-embed.mjs";

export class StockpileMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerStockpile> {
  override getPlayerObjectiveStats(stats: PlayerStats<GameVariantCategory.MultiplayerStockpile>): Map<string, string> {
    return new Map([
      ["Power seeds deposited", stats.StockpileStats.PowerSeedsDeposited.toString()],
      ["Power seeds stolen", stats.StockpileStats.PowerSeedsStolen.toString()],
      ["Kills as power seed carrier", stats.StockpileStats.KillsAsPowerSeedCarrier.toString()],
      ["Power seed carriers killed", stats.StockpileStats.PowerSeedCarriersKilled.toString()],
      ["Time as power seed carrier", this.haloService.getReadableDuration(stats.StockpileStats.TimeAsPowerSeedCarrier)],
      ["Time as power seed driver", this.haloService.getReadableDuration(stats.StockpileStats.TimeAsPowerSeedDriver)],
    ]);
  }
}
