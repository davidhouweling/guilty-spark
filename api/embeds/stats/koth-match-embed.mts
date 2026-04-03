import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getDurationInSeconds, getReadableDuration } from "@guilty-spark/shared/halo/duration";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed, StatsValueSortBy } from "./base-match-embed.mjs";

export class KOTHMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerKingOfTheHill> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerKingOfTheHill>): EmbedPlayerStats {
    return new Map([
      ["Captures", { value: stats.ZonesStats.StrongholdCaptures, sortBy: StatsValueSortBy.DESC }],
      [
        "Occupation time",
        {
          value: getDurationInSeconds(stats.ZonesStats.StrongholdOccupationTime),
          sortBy: StatsValueSortBy.DESC,
          display: getReadableDuration(stats.ZonesStats.StrongholdOccupationTime, this.locale),
        },
      ],
      ["Secures", { value: stats.ZonesStats.StrongholdSecures, sortBy: StatsValueSortBy.DESC }],
      ["Offensive kills", { value: stats.ZonesStats.StrongholdOffensiveKills, sortBy: StatsValueSortBy.DESC }],
      ["Defensive kills", { value: stats.ZonesStats.StrongholdDefensiveKills, sortBy: StatsValueSortBy.DESC }],
    ]);
  }
}
