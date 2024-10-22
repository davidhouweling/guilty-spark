import { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed, PlayerStats } from "./base-match-embed.mjs";

export class CtfMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerCtf> {
  override getPlayerObjectiveStats(stats: PlayerStats<GameVariantCategory.MultiplayerCtf>): Map<string, string> {
    return new Map([
      ["Captures", stats.CaptureTheFlagStats.FlagCaptures.toString()],
      ["Captures assists", stats.CaptureTheFlagStats.FlagCaptureAssists.toString()],
      ["Carrier time", this.haloService.getReadableDuration(stats.CaptureTheFlagStats.TimeAsFlagCarrier)],
      ["Grabs", stats.CaptureTheFlagStats.FlagGrabs.toString()],
      ["Returns", stats.CaptureTheFlagStats.FlagReturns.toString()],
      ["Carriers killed", stats.CaptureTheFlagStats.FlagCarriersKilled.toString()],
    ]);
  }
}
