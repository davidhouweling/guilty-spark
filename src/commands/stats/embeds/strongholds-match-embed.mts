import { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed, PlayerStats } from "./base-match-embed.mjs";

export class StrongholdsMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerStrongholds> {
  override getPlayerObjectiveStats(
    stats: PlayerStats<GameVariantCategory.MultiplayerStrongholds>,
  ): Map<string, string> {
    return new Map([
      ["Captures", stats.ZonesStats.StrongholdCaptures.toString()],
      ["Occupation time", this.haloService.getReadableDuration(stats.ZonesStats.StrongholdOccupationTime)],
      ["Secures", stats.ZonesStats.StrongholdSecures.toString()],
      ["Offensive kills", stats.ZonesStats.StrongholdOffensiveKills.toString()],
      ["Defensive kills", stats.ZonesStats.StrongholdDefensiveKills.toString()],
    ]);
  }
}
