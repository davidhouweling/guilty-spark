import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getInfectionObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class InfectionMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerInfection> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerInfection>): EmbedPlayerStats {
    return new Map(getInfectionObjectiveStats(stats, this.locale));
  }
}
