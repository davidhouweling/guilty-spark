import type { GameVariantCategory } from "halo-infinite-api";
import type { EmbedPlayerStats } from "./base-match-embed";
import { BaseMatchEmbed } from "./base-match-embed";

export class TotalControlMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerTotalControl> {
  override getPlayerObjectiveStats(): EmbedPlayerStats {
    return new Map([]);
  }
}
