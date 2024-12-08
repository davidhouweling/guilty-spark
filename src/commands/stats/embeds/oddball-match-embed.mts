import type { GameVariantCategory } from "halo-infinite-api";
import type { PlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class OddballMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerOddball> {
  override getPlayerObjectiveStats(stats: PlayerStats<GameVariantCategory.MultiplayerOddball>): Map<string, string> {
    return new Map([
      ["Total time as carrier", this.haloService.getReadableDuration(stats.OddballStats.TimeAsSkullCarrier)],
      ["Longest time as carrier", this.haloService.getReadableDuration(stats.OddballStats.LongestTimeAsSkullCarrier)],
    ]);
  }
}
