import type { GameVariantCategory, Stats } from "halo-infinite-api";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed, StatsValueSortBy } from "./base-match-embed.mjs";

export class VIPMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerVIP> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerVIP>): EmbedPlayerStats {
    return new Map([
      ["VIP kills", { value: stats.VipStats.VipKills, sortBy: StatsValueSortBy.DESC }],
      ["VIP Assists", { value: stats.VipStats.VipAssists, sortBy: StatsValueSortBy.DESC }],
      ["Kills as VIP", { value: stats.VipStats.KillsAsVip, sortBy: StatsValueSortBy.DESC }],
      ["Times selected as VIP", { value: stats.VipStats.TimesSelectedAsVip, sortBy: StatsValueSortBy.DESC }],
      ["Max killing spree as VIP", { value: stats.VipStats.MaxKillingSpreeAsVip, sortBy: StatsValueSortBy.DESC }],
      [
        "Longest Time as VIP",
        {
          value: this.haloService.getDurationInSeconds(stats.VipStats.LongestTimeAsVip),
          sortBy: StatsValueSortBy.DESC,
          display: this.haloService.getReadableDuration(stats.VipStats.LongestTimeAsVip),
        },
      ],
      [
        "Time as VIP",
        {
          value: this.haloService.getDurationInSeconds(stats.VipStats.TimeAsVip),
          sortBy: StatsValueSortBy.DESC,
          display: this.haloService.getReadableDuration(stats.VipStats.TimeAsVip),
        },
      ],
    ]);
  }
}
