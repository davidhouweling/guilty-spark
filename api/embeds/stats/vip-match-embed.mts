import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getVipObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class VIPMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerVIP> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerVIP>): EmbedPlayerStats {
    return new Map(getVipObjectiveStats(stats, this.locale));
  }
}
