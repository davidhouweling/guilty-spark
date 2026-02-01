import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";
import type { StatsCollection } from "./types";
import { StatsValueSortBy } from "./types";

export class ExtractionMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerExtraction>): StatsCollection {
    return new Map([
      ["Successful extractions", { value: stats.ExtractionStats.SuccessfulExtractions, sortBy: StatsValueSortBy.DESC }],
      [
        "Initiations completed",
        {
          value: stats.ExtractionStats.ExtractionInitiationsCompleted,
          sortBy: StatsValueSortBy.DESC,
        },
      ],
      [
        "Initiations denied",
        {
          value: stats.ExtractionStats.ExtractionInitiationsDenied,
          sortBy: StatsValueSortBy.DESC,
        },
      ],
      [
        "Conversions completed",
        {
          value: stats.ExtractionStats.ExtractionConversionsCompleted,
          sortBy: StatsValueSortBy.DESC,
        },
      ],
      [
        "Conversions denied",
        {
          value: stats.ExtractionStats.ExtractionConversionsDenied,
          sortBy: StatsValueSortBy.DESC,
        },
      ],
    ]);
  }
}
