import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getExtractionObjectiveStats } from "@guilty-spark/shared/halo/objective-stats";
import type { EmbedPlayerStats } from "./base-match-embed";
import { BaseMatchEmbed } from "./base-match-embed";

export class ExtractionMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerExtraction> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerExtraction>): EmbedPlayerStats {
    return new Map(getExtractionObjectiveStats(stats, { includeExtractionPrefixInLabels: true }));
  }
}
