import type { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class VIPMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerVIP> {
  override getPlayerObjectiveStats(): Map<string, string> {
    return new Map([]);
  }
}
