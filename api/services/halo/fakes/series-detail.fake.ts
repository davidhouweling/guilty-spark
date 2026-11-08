import { GameVariantCategory, MatchOutcome } from "halo-infinite-api";
import type { MatchStats } from "halo-infinite-api";
import { aFakeCoreStatsWith } from "@guilty-spark/shared/halo/fakes/data";
import { aMatchWithSwappableRosters } from "./data";

export function aFakeSeriesDetailMatchWith(index: number, swapped = false, substitute = false): MatchStats {
  const indexText = index.toString();
  const firstRoster = ["0100000000000000", substitute ? "0900000000000000" : "0200000000000000"];
  const secondRoster = ["0400000000000000", "0800000000000000"];
  const match = aMatchWithSwappableRosters({
    matchId: `match-${indexText}`,
    startTime: `2024-01-01T0${indexText}:00:00Z`,
    mapAssetId: `map-${indexText}`,
    team0PlayerIds: swapped ? secondRoster : firstRoster,
    team1PlayerIds: swapped ? firstRoster : secondRoster,
    team0Outcome: swapped ? MatchOutcome.Loss : MatchOutcome.Win,
    team1Outcome: swapped ? MatchOutcome.Win : MatchOutcome.Loss,
  });
  return {
    ...match,
    MatchInfo: {
      ...match.MatchInfo,
      EndTime: `2024-01-01T0${indexText}:10:00Z`,
      GameVariantCategory: GameVariantCategory.MultiplayerSlayer,
    },
    Teams: match.Teams.map((team) => ({
      ...team,
      TeamId: team.TeamId === 0 ? 7 : 3,
      Stats: { CoreStats: aFakeCoreStatsWith({ Score: team.TeamId === 0 ? 50 : 40, Kills: 10 + index }) },
    })),
    Players: match.Players.map((player) => ({
      ...player,
      LastTeamId: player.LastTeamId === 0 ? 7 : 3,
      PlayerTeamStats: player.PlayerTeamStats.map((stats) => ({
        TeamId: stats.TeamId === 0 ? 7 : 3,
        Stats: { CoreStats: aFakeCoreStatsWith({ Kills: index + 1 }) },
      })),
    })),
  };
}
