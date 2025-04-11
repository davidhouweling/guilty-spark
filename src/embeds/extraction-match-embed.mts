import type { GameVariantCategory, Stats } from "halo-infinite-api";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed, StatsValueSortBy } from "./base-match-embed.mjs";

export class ExtractionMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerExtraction> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerExtraction>): EmbedPlayerStats {
    return new Map([
      ["Successful extractions", { value: stats.ExtractionStats.SuccessfulExtractions, sortBy: StatsValueSortBy.DESC }],
      [
        "Extraction initiations completed",
        {
          value: stats.ExtractionStats.ExtractionInitiationsCompleted,
          sortBy: StatsValueSortBy.DESC,
        },
      ],
      [
        "Extraction initiations denied",
        {
          value: stats.ExtractionStats.ExtractionInitiationsDenied,
          sortBy: StatsValueSortBy.DESC,
        },
      ],
      [
        "Extraction conversions completed",
        {
          value: stats.ExtractionStats.ExtractionConversionsCompleted,
          sortBy: StatsValueSortBy.DESC,
        },
      ],
      [
        "Extraction conversions denied",
        {
          value: stats.ExtractionStats.ExtractionConversionsDenied,
          sortBy: StatsValueSortBy.DESC,
        },
      ],
    ]);
  }
}
