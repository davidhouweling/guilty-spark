import type { GameVariantCategory, Stats } from "halo-infinite-api";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed, StatsValueSortBy } from "./base-match-embed.mjs";

export class StrongholdsMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerStrongholds> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerStrongholds>): EmbedPlayerStats {
    return new Map([
      ["Captures", { value: stats.ZonesStats.StrongholdCaptures, sortBy: StatsValueSortBy.DESC }],
      [
        "Occupation time",
        {
          value: this.haloService.getDurationInSeconds(stats.ZonesStats.StrongholdOccupationTime),
          sortBy: StatsValueSortBy.DESC,
          display: this.haloService.getReadableDuration(stats.ZonesStats.StrongholdOccupationTime, this.locale),
        },
      ],
      ["Secures", { value: stats.ZonesStats.StrongholdSecures, sortBy: StatsValueSortBy.DESC }],
      ["Offensive kills", { value: stats.ZonesStats.StrongholdOffensiveKills, sortBy: StatsValueSortBy.DESC }],
      ["Defensive kills", { value: stats.ZonesStats.StrongholdDefensiveKills, sortBy: StatsValueSortBy.DESC }],
    ]);
  }
}
