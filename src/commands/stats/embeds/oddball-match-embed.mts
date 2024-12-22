import type { GameVariantCategory } from "halo-infinite-api";
import type { EmbedPlayerStats, PlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed, StatsValueSortBy } from "./base-match-embed.mjs";

export class OddballMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerOddball> {
  override getPlayerObjectiveStats(stats: PlayerStats<GameVariantCategory.MultiplayerOddball>): EmbedPlayerStats {
    return new Map([
      [
        "Total time as carrier",
        {
          value: this.haloService.getDurationInSeconds(stats.OddballStats.TimeAsSkullCarrier),
          sortBy: StatsValueSortBy.DESC,
          display: this.haloService.getReadableDuration(stats.OddballStats.TimeAsSkullCarrier),
        },
      ],
      [
        "Longest time as carrier",
        {
          value: this.haloService.getDurationInSeconds(stats.OddballStats.LongestTimeAsSkullCarrier),
          sortBy: StatsValueSortBy.DESC,
          display: this.haloService.getReadableDuration(stats.OddballStats.LongestTimeAsSkullCarrier),
        },
      ],
    ]);
  }
}
