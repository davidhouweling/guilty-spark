import { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed, PlayerStats } from "./base-match-embed.mjs";

export class KOTHMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerKingOfTheHill> {
  override getPlayerObjectiveStats(
    stats: PlayerStats<GameVariantCategory.MultiplayerKingOfTheHill>,
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
