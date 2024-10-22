import { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class EscalationMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerEscalation> {
  override getPlayerObjectiveStats(): Map<string, string> {
    return new Map();
  }
}
