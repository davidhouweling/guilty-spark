import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";
import type { StatsCollection } from "./types";
import { StatsValueSortBy } from "./types";

export class VIPMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerVIP>): StatsCollection {
    return new Map([
      ["VIP kills", { value: stats.VipStats.VipKills, sortBy: StatsValueSortBy.DESC }],
      ["VIP Assists", { value: stats.VipStats.VipAssists, sortBy: StatsValueSortBy.DESC }],
      ["Kills as VIP", { value: stats.VipStats.KillsAsVip, sortBy: StatsValueSortBy.DESC }],
      ["Times selected as VIP", { value: stats.VipStats.TimesSelectedAsVip, sortBy: StatsValueSortBy.DESC }],
      ["Max killing spree as VIP", { value: stats.VipStats.MaxKillingSpreeAsVip, sortBy: StatsValueSortBy.DESC }],
      [
        "Longest Time as VIP",
        {
          value: this.getDurationInSeconds(stats.VipStats.LongestTimeAsVip),
          sortBy: StatsValueSortBy.DESC,
          display: this.getReadableDuration(stats.VipStats.LongestTimeAsVip),
        },
      ],
      [
        "Time as VIP",
        {
          value: this.getDurationInSeconds(stats.VipStats.TimeAsVip),
          sortBy: StatsValueSortBy.DESC,
          display: this.getReadableDuration(stats.VipStats.TimeAsVip),
        },
      ],
    ]);
  }
}
