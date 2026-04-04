import type { GameVariantCategory } from "halo-infinite-api";
import type { EmbedPlayerStats } from "./base-match-embed";
import { BaseMatchEmbed } from "./base-match-embed";

export class MinigameMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerMinigame> {
  override getPlayerObjectiveStats(): EmbedPlayerStats {
    return new Map([]);
  }
}
