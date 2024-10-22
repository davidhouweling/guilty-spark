import { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed, PlayerStats } from "./base-match-embed.mjs";

export class ExtractionMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerExtraction> {
  override getPlayerObjectiveStats(stats: PlayerStats<GameVariantCategory.MultiplayerExtraction>): Map<string, string> {
    return new Map([
      ["Successful extractions", stats.ExtractionStats.SuccessfulExtractions.toString()],
      ["Extraction initiations completed", stats.ExtractionStats.ExtractionInitiationsCompleted.toString()],
      ["Extraction initiations denied", stats.ExtractionStats.ExtractionInitiationsDenied.toString()],
      ["Extraction conversions completed", stats.ExtractionStats.ExtractionConversionsCompleted.toString()],
      ["Extraction conversions denied", stats.ExtractionStats.ExtractionConversionsDenied.toString()],
    ]);
  }
}
