import { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed, PlayerStats } from "./base-match-embed.mjs";

export class OddballMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerOddball> {
  override getPlayerObjectiveStats(stats: PlayerStats<GameVariantCategory.MultiplayerOddball>): Map<string, string> {
    return new Map([
      ["Total time as carrier", this.haloService.getReadableDuration(stats.OddballStats.TimeAsSkullCarrier)],
      ["Longest time as carrier", this.haloService.getReadableDuration(stats.OddballStats.LongestTimeAsSkullCarrier)],
    ]);
  }
}
