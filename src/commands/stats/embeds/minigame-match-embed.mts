import type { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class MinigameMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerMinigame> {
  override getPlayerObjectiveStats(): Map<string, string> {
    return new Map([]);
  }
}
