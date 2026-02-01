import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";
import type { StatsCollection } from "./types";
import { StatsValueSortBy } from "./types";

export class CtfMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerCtf>): StatsCollection {
    return new Map([
      ["Captures", { value: stats.CaptureTheFlagStats.FlagCaptures, sortBy: StatsValueSortBy.DESC }],
      ["Captures assists", { value: stats.CaptureTheFlagStats.FlagCaptureAssists, sortBy: StatsValueSortBy.DESC }],
      [
        "Carrier time",
        {
          value: this.getDurationInSeconds(stats.CaptureTheFlagStats.TimeAsFlagCarrier),
          sortBy: StatsValueSortBy.DESC,
          display: this.getReadableDuration(stats.CaptureTheFlagStats.TimeAsFlagCarrier),
        },
      ],
      ["Grabs", { value: stats.CaptureTheFlagStats.FlagGrabs, sortBy: StatsValueSortBy.DESC }],
      ["Returns", { value: stats.CaptureTheFlagStats.FlagReturns, sortBy: StatsValueSortBy.DESC }],
      ["Carriers killed", { value: stats.CaptureTheFlagStats.FlagCarriersKilled, sortBy: StatsValueSortBy.DESC }],
    ]);
  }
}
