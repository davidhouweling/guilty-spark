import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getEliminationObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class EliminationMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerElimination> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerElimination>): EmbedPlayerStats {
    return new Map(getEliminationObjectiveStats(stats));
  }
}
