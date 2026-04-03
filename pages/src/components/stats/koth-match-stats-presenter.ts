import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { getDurationInSeconds, getReadableDuration } from "@guilty-spark/shared/halo/duration";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";
import type { StatsCollection } from "./types";
import { StatsValueSortBy } from "./types";

export class KOTHMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerKingOfTheHill>): StatsCollection {
    return new Map([
      ["Captures", { value: stats.ZonesStats.StrongholdCaptures, sortBy: StatsValueSortBy.DESC }],
      [
        "Occupation time",
        {
          value: getDurationInSeconds(stats.ZonesStats.StrongholdOccupationTime),
          sortBy: StatsValueSortBy.DESC,
          display: getReadableDuration(stats.ZonesStats.StrongholdOccupationTime),
        },
      ],
      ["Secures", { value: stats.ZonesStats.StrongholdSecures, sortBy: StatsValueSortBy.DESC }],
      ["Offensive kills", { value: stats.ZonesStats.StrongholdOffensiveKills, sortBy: StatsValueSortBy.DESC }],
      ["Defensive kills", { value: stats.ZonesStats.StrongholdDefensiveKills, sortBy: StatsValueSortBy.DESC }],
    ]);
  }
}
