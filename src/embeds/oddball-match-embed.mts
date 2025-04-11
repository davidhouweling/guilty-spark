import type { GameVariantCategory, Stats } from "halo-infinite-api";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed, StatsValueSortBy } from "./base-match-embed.mjs";

export class OddballMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerOddball> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerOddball>): EmbedPlayerStats {
    return new Map([
      [
        "Total time as carrier",
        {
          value: this.haloService.getDurationInSeconds(stats.OddballStats.TimeAsSkullCarrier),
          sortBy: StatsValueSortBy.DESC,
          display: this.haloService.getReadableDuration(stats.OddballStats.TimeAsSkullCarrier, this.locale),
        },
      ],
      [
        "Longest time as carrier",
        {
          value: this.haloService.getDurationInSeconds(stats.OddballStats.LongestTimeAsSkullCarrier),
          sortBy: StatsValueSortBy.DESC,
          display: this.haloService.getReadableDuration(stats.OddballStats.LongestTimeAsSkullCarrier, this.locale),
        },
      ],
    ]);
  }
}
