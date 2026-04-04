import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getOddballObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class OddballMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerOddball> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerOddball>): EmbedPlayerStats {
    return new Map(getOddballObjectiveStats(stats, this.locale));
  }
}
