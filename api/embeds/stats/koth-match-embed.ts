import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getStrongholdsObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { EmbedPlayerStats } from "./base-match-embed";
import { BaseMatchEmbed } from "./base-match-embed";

export class KOTHMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerKingOfTheHill> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerKingOfTheHill>): EmbedPlayerStats {
    return new Map(getStrongholdsObjectiveStats(stats, this.locale));
  }
}
