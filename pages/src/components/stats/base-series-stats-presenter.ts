import type { GameVariantCategory, MatchStats, Stats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import {
  mergeCoreStats as mergeSharedCoreStats,
  adjustAveragesInCoreStats as adjustSharedCoreStatsAverages,
} from "@guilty-spark/shared/halo/series-core-stats";
import type { MatchStatsPlayerData, PlayerTeamStats } from "./types";

export abstract class BaseSeriesStatsPresenter {
  protected mergeCoreStats(
    existingCoreStats: Stats["CoreStats"],
    incomingCoreStats: Stats["CoreStats"],
  ): Stats["CoreStats"] {
    return mergeSharedCoreStats(existingCoreStats, incomingCoreStats);
  }

  protected adjustAveragesInCoreStats(coreStats: Stats["CoreStats"], matches: number): Stats["CoreStats"] {
    return adjustSharedCoreStatsAverages(coreStats, matches);
  }

  protected getTeamPlayersFromMatches(matches: MatchStats[], team: MatchStats["Teams"][0]): MatchStats["Players"] {
    const uniquePlayersMap = new Map<string, MatchStats["Players"][0]>();
    for (const match of matches) {
      for (const player of match.Players) {
        if (!player.ParticipationInfo.PresentAtBeginning) {
          continue;
        }

        if (!uniquePlayersMap.has(player.PlayerId)) {
          uniquePlayersMap.set(player.PlayerId, player);
        }
      }
    }

    return Array.from(uniquePlayersMap.values()).filter(
      (player): boolean => player.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId) != null,
    );
  }

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

        const mergedStats = this.mergeCoreStats(Preconditions.checkExists(playerCoreStats.get(PlayerId)), CoreStats);
        playerCoreStats.set(PlayerId, mergedStats);
      }
    }

    // adjust some of the values which should be averages rather than sums
    for (const [playerId, stats] of playerCoreStats.entries()) {
      playerCoreStats.set(playerId, this.adjustAveragesInCoreStats(stats, matches.length));
    }

    return playerCoreStats;
  }

  public getPlayerXuid(player: Pick<MatchStats["Players"][0], "PlayerId">): string {
    return player.PlayerId.replace(/^xuid\((\d+)\)$/, "$1");
  }

  protected aggregateTeamMedals(
    players: MatchStatsPlayerData[],
  ): { name: string; count: number; sortingWeight: number }[] {
    const medalMap = new Map<string, { name: string; count: number; sortingWeight: number }>();
    for (const player of players) {
      for (const medal of player.medals) {
        const existing = medalMap.get(medal.name);
        if (existing) {
          existing.count += medal.count;
        } else {
          medalMap.set(medal.name, { ...medal });
        }
      }
    }
    return Array.from(medalMap.values()).sort((a, b) => b.sortingWeight - a.sortingWeight);
  }
}
