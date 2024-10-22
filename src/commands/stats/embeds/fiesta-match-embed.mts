import { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class FiestaMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerFiesta> {
  override getPlayerObjectiveStats(): Map<string, string> {
    return new Map([]);
  }
}
