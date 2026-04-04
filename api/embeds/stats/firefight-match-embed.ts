import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getFirefightObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { EmbedPlayerStats } from "./base-match-embed";
import { BaseMatchEmbed } from "./base-match-embed";

export class FirefightMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerFirefight> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerFirefight>): EmbedPlayerStats {
    return new Map(getFirefightObjectiveStats(stats));
  }
}
