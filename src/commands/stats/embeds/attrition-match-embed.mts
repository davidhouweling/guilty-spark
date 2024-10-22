import { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class AttritionMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerAttrition> {
  override getPlayerObjectiveStats(): Map<string, string> {
    return new Map([]);
  }
}
