import type { GameVariantCategory, MatchStats, Stats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import {
  mergeCoreStats as mergeSharedCoreStats,
  adjustAveragesInCoreStats as adjustSharedCoreStatsAverages,
} from "@guilty-spark/shared/halo/series-core-stats";
import type { PlayerTeamStats } from "./types";

export abstract class BaseSeriesStatsPresenter {
  protected aggregatePlayerCoreStats(matches: MatchStats[]): Map<string, Stats["CoreStats"]> {
    const playerCoreStats = new Map<string, Stats["CoreStats"]>();
    for (const match of matches) {
      for (const player of match.Players) {
        if (!player.ParticipationInfo.PresentAtBeginning) {
          continue;
        }

        const { PlayerId } = player;
        const stats = Preconditions.checkExists(player.PlayerTeamStats[0]) as PlayerTeamStats<GameVariantCategory>;
        const { CoreStats } = stats.Stats;

        if (!playerCoreStats.has(PlayerId)) {
          playerCoreStats.set(PlayerId, CoreStats);
          continue;
        }

        const mergedStats = mergeSharedCoreStats(Preconditions.checkExists(playerCoreStats.get(PlayerId)), CoreStats);
        playerCoreStats.set(PlayerId, mergedStats);
      }
    }

    // adjust some of the values which should be averages rather than sums
    for (const [playerId, stats] of playerCoreStats.entries()) {
      playerCoreStats.set(playerId, adjustSharedCoreStatsAverages(stats, matches.length));
    }

    return playerCoreStats;
  }
}
