import { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class GrifballMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerGrifball> {
  override getPlayerObjectiveStats(): Map<string, string> {
    return new Map([]);
  }
}