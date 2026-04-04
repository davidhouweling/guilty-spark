import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getStockpileObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { EmbedPlayerStats } from "./base-match-embed";
import { BaseMatchEmbed } from "./base-match-embed";

export class StockpileMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerStockpile> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerStockpile>): EmbedPlayerStats {
    return new Map(getStockpileObjectiveStats(stats, this.locale));
  }
}
