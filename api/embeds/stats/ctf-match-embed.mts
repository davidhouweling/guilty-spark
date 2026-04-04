import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getCtfObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class CtfMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerCtf> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerCtf>): EmbedPlayerStats {
    return new Map(getCtfObjectiveStats(stats, this.locale));
  }
}
