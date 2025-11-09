import type { GameVariantCategory, Stats } from "halo-infinite-api";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed, StatsValueSortBy } from "./base-match-embed.mjs";

export class CtfMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerCtf> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerCtf>): EmbedPlayerStats {
    return new Map([
      ["Captures", { value: stats.CaptureTheFlagStats.FlagCaptures, sortBy: StatsValueSortBy.DESC }],
      ["Captures assists", { value: stats.CaptureTheFlagStats.FlagCaptureAssists, sortBy: StatsValueSortBy.DESC }],
      [
        "Carrier time",
        {
          value: this.haloService.getDurationInSeconds(stats.CaptureTheFlagStats.TimeAsFlagCarrier),
          sortBy: StatsValueSortBy.DESC,
          display: this.haloService.getReadableDuration(stats.CaptureTheFlagStats.TimeAsFlagCarrier, this.locale),
        },
      ],
      ["Grabs", { value: stats.CaptureTheFlagStats.FlagGrabs, sortBy: StatsValueSortBy.DESC }],
      ["Returns", { value: stats.CaptureTheFlagStats.FlagReturns, sortBy: StatsValueSortBy.DESC }],
      ["Carriers killed", { value: stats.CaptureTheFlagStats.FlagCarriersKilled, sortBy: StatsValueSortBy.DESC }],
    ]);
  }
}
