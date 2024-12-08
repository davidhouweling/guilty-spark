import type { GameVariantCategory } from "halo-infinite-api";
import type { PlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

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
