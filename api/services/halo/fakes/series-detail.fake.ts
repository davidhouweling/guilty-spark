import { addHours, addMinutes, parseISO } from "date-fns";
import { GameVariantCategory, MatchOutcome } from "halo-infinite-api";
import type { MatchStats } from "halo-infinite-api";
import type { ConfiguredTeamContext } from "@guilty-spark/shared/contracts/stats/detail";
import { aFakeCoreStatsWith } from "@guilty-spark/shared/halo/fakes/data";
import { aMatchWithSwappableRosters } from "./data";

export function aFakeConfiguredTeamContextWith(overrides: Partial<ConfiguredTeamContext> = {}): ConfiguredTeamContext {
  return {
    teams: [
      { name: "Configured A", playerIds: ["d4", "d8"] },
      { name: "Configured B", playerIds: ["d1", "d9"] },
    ],
    playersAssociationData: {
      d1: { xboxId: "xuid(0100000000000000)" },
      d2: { xboxId: "0200000000000000" },
      d4: { xboxId: "0400000000000000" },
      d8: { xboxId: "0800000000000000" },
      d9: { xboxId: "0900000000000000" },
    },
    substitutions: [
      {
        playerOutId: "d2",
        playerInId: "d9",
        teamIndex: 1,
        timestamp: "2024-01-01T00:30:00Z",
      },
    ],
    ...overrides,
  };
}

export function aFakeSeriesDetailMatchWith(index: number, swapped = false, substitute = false): MatchStats {
  const indexText = index.toString();
  const startTime = addHours(parseISO("2024-01-01T00:00:00Z"), index);
  const firstRoster = ["0100000000000000", substitute ? "0900000000000000" : "0200000000000000"];
  const secondRoster = ["0400000000000000", "0800000000000000"];
  const match = aMatchWithSwappableRosters({
    matchId: `match-${indexText}`,
    startTime: startTime.toISOString(),
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
      EndTime: addMinutes(startTime, 10).toISOString(),
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
