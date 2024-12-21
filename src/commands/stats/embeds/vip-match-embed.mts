import type { GameVariantCategory } from "halo-infinite-api";
import type { PlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class VIPMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerVIP> {
  override getPlayerObjectiveStats(stats: PlayerStats<GameVariantCategory.MultiplayerVIP>): Map<string, string> {
    return new Map([
      ["VIP kills", stats.VipStats.VipKills.toString()],
      ["VIP Assists", stats.VipStats.VipAssists.toString()],
      ["Kills as VIP", stats.VipStats.KillsAsVip.toString()],
      ["Times selected as VIP", stats.VipStats.TimesSelectedAsVip.toString()],
      ["Max killing spree as VIP", stats.VipStats.MaxKillingSpreeAsVip.toString()],
      ["Longest Time as VIP", this.haloService.getReadableDuration(stats.VipStats.LongestTimeAsVip)],
      ["Time as VIP", this.haloService.getReadableDuration(stats.VipStats.TimeAsVip)],
    ]);
  }
}
