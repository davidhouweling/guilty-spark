import { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class LandGrabMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerLandGrab> {
  override getPlayerObjectiveStats(): Map<string, string> {
    return new Map([]);
  }
}
