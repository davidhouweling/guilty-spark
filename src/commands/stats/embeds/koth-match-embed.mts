import type { GameVariantCategory } from "halo-infinite-api";
import type { EmbedPlayerStats, PlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed, StatsValueSortBy } from "./base-match-embed.mjs";

export class KOTHMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerKingOfTheHill> {
  override getPlayerObjectiveStats(stats: PlayerStats<GameVariantCategory.MultiplayerKingOfTheHill>): EmbedPlayerStats {
    return new Map([
      ["Captures", { value: stats.ZonesStats.StrongholdCaptures, sortBy: StatsValueSortBy.DESC }],
      [
        "Occupation time",
        {
          value: this.haloService.getDurationInSeconds(stats.ZonesStats.StrongholdOccupationTime),
          sortBy: StatsValueSortBy.DESC,
          display: this.haloService.getReadableDuration(stats.ZonesStats.StrongholdOccupationTime),
        },
      ],
      ["Secures", { value: stats.ZonesStats.StrongholdSecures, sortBy: StatsValueSortBy.DESC }],
      ["Offensive kills", { value: stats.ZonesStats.StrongholdOffensiveKills, sortBy: StatsValueSortBy.DESC }],
      ["Defensive kills", { value: stats.ZonesStats.StrongholdDefensiveKills, sortBy: StatsValueSortBy.DESC }],
    ]);
  }
}
