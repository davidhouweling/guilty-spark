import type { GameVariantCategory } from "halo-infinite-api";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class EscalationMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerEscalation> {
  override getPlayerObjectiveStats(): EmbedPlayerStats {
    return new Map();
  }
}
