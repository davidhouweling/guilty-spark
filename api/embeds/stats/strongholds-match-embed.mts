import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getStrongholdsObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class StrongholdsMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerStrongholds> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerStrongholds>): EmbedPlayerStats {
    return new Map(getStrongholdsObjectiveStats(stats, this.locale));
  }
}
