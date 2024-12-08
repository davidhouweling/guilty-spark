import type { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class UnknownMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerTotalControl> {
  override getPlayerObjectiveStats(): Map<string, string> {
    return new Map([]);
  }
}
