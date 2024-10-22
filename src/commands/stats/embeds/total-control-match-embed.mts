import { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class TotalControlMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerTotalControl> {
  override getPlayerObjectiveStats(): Map<string, string> {
    return new Map([]);
  }
}
