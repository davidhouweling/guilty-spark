import type { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class SlayerMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerSlayer> {
  override getPlayerObjectiveStats(): Map<string, string> {
    return new Map([]);
  }
}
