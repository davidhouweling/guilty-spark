import { describe, expect, it } from "vitest";
import { GameVariantCategory, MatchOutcome } from "halo-infinite-api";
import type { MatchStats, Stats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { SeriesAggregation } from "@guilty-spark/shared/contracts/stats/detail";
import {
  aFakeCoreStatsWith,
  aFakeCtfStatsWith,
  aFakeMatchStatsWith,
  aFakePlayerWith,
  aFakeTeamWith,
} from "@guilty-spark/shared/halo/fakes/data";
import { mapSeriesDetailAggregation } from "../series-detail-aggregation";

type TestMode = "slayer" | "ctf";

function createStats(mode: TestMode, coreStats: Stats["CoreStats"]): Stats {
  if (mode === "ctf") {
    return { ...aFakeCtfStatsWith({ TimeAsFlagCarrier: "PT30S" }), CoreStats: coreStats };
  }
  return { ...aFakeTeamWith().Stats, CoreStats: coreStats };
}

function aStableMatchWith(
  matchId: string,
  startTime: string,
  mapAssetId: string,
  mode: TestMode,
  outcomes: readonly [number, number],
): MatchStats {
  const source = aFakeMatchStatsWith();
  const category = mode === "ctf" ? GameVariantCategory.MultiplayerCtf : GameVariantCategory.MultiplayerSlayer;
  const teamIds = [17, 4];
  return aFakeMatchStatsWith({
    MatchId: matchId,
    MatchInfo: {
      ...source.MatchInfo,
      StartTime: startTime,
      GameVariantCategory: category,
      MapVariant: { ...source.MatchInfo.MapVariant, AssetId: mapAssetId },
    },
    Teams: source.Teams.map((team, index) => {
      const teamId = Preconditions.checkExists(teamIds[index]);
      return {
        ...team,
        TeamId: teamId,
        Outcome: Preconditions.checkExists(outcomes[index]),
        Stats: createStats(
          mode,
          aFakeCoreStatsWith({
            Kills: mode === "ctf" ? 9 : 11,
            DamageDealt: 100,
            DamageTaken: 0,
            Medals: [{ NameId: 622331684, Count: mode === "ctf" ? 2 : 3, TotalPersonalScoreAwarded: 20 }],
          }),
        ),
      };
    }),
    Players: source.Players.map((player, index) => {
      const teamId = player.LastTeamId === 0 ? 17 : 4;
      const damageTaken = index === 0 ? 0 : 25;
      return {
        ...player,
        LastTeamId: teamId,
        PlayerTeamStats: player.PlayerTeamStats.map((stats) => ({
          ...stats,
          TeamId: teamId,
          Stats: createStats(
            mode,
            aFakeCoreStatsWith({
              Kills: mode === "ctf" ? 4 : 6,
              DamageDealt: 100,
              DamageTaken: damageTaken,
              Medals: [{ NameId: 622331684, Count: mode === "ctf" ? 2 : 3, TotalPersonalScoreAwarded: 20 }],
            }),
          ),
        })),
      };
    }),
  });
}

function markPlayerAsSub(match: MatchStats, playerId: string): MatchStats {
  return {
    ...match,
    Players: match.Players.map((player) =>
      player.PlayerId === playerId
        ? {
            ...player,
            ParticipationInfo: {
              ...player.ParticipationInfo,
              PresentAtBeginning: false,
              JoinedInProgress: true,
            },
          }
        : player,
    ),
  };
}

function getResolvedAggregation(aggregation: SeriesAggregation): Extract<SeriesAggregation, { status: "resolved" }> {
  if (aggregation.status !== "resolved") {
    throw new Error(`Expected resolved aggregation, received ${aggregation.status}`);
  }
  return aggregation;
}

describe("mapSeriesDetailAggregation()", () => {
  it("maps stable nonsequential teams and mixed-mode numeric totals without exposing raw matches", () => {
    const matches = [
      aStableMatchWith("ctf-game", "2026-11-01T10:00:00.000Z", "ctf-map", "ctf", [MatchOutcome.Win, MatchOutcome.Loss]),
      aStableMatchWith("slayer-game", "2026-11-01T10:10:00.000Z", "slayer-map", "slayer", [
        MatchOutcome.Win,
        MatchOutcome.Loss,
      ]),
    ];
    const originalJson = JSON.stringify(matches);
    const result = getResolvedAggregation(
      mapSeriesDetailAggregation(matches, {
        identitiesByPlayerId: new Map([["xuid(1111111111)", { gamertag: "One", discordUserId: "123456" }]]),
        teamNamesBySeriesTeamId: new Map([[17, "Named team"]]),
      }),
    );
    expect(result).toMatchObject({ gamesPlayed: 2, completedGameCount: 2 });
    expect(
      result.teams.map(({ seriesTeamId, name, outcome, gamesPlayed, gamesWon }) => ({
        seriesTeamId,
        name,
        outcome,
        gamesPlayed,
        gamesWon,
      })),
    ).toEqual([
      { seriesTeamId: 17, name: "Named team", outcome: "Win", gamesPlayed: 2, gamesWon: 2 },
      { seriesTeamId: 4, name: null, outcome: "Loss", gamesPlayed: 2, gamesWon: 0 },
    ]);

    const player = Preconditions.checkExists(result.players.find(({ playerId }) => playerId === "xuid(1111111111)"));
    expect(player).toMatchObject({
      playerId: "xuid(1111111111)",
      xuid: "1111111111",
      discordUserId: "123456",
      gamertag: "One",
      gamesPlayed: 2,
    });
    expect(player.teamStats.map(({ seriesTeamId, gamesPlayed }) => ({ seriesTeamId, gamesPlayed }))).toEqual([
      { seriesTeamId: 17, gamesPlayed: 2 },
    ]);
    expect(player.stats.find(({ key }) => key === "Kills")).toMatchObject({ value: 10 });
    expect(player.teamStats[0]?.stats.find(({ key }) => key === "Kills")).toMatchObject({ value: 10 });
    expect(result.teams[0]?.stats.find(({ key }) => key === "Kills")).toMatchObject({ value: 20 });
    expect(player.stats.find(({ key }) => key === "Damage ratio")).toMatchObject({
      status: "unbounded",
      numerator: 200,
      denominator: 0,
    });
    expect(player.stats.find(({ key }) => key === "Objective time")).toMatchObject({
      value: 30,
      format: "duration-seconds",
    });
    expect(player.medals).toEqual([
      { id: 622331684, count: 5, name: null, sortingWeight: null, difficultyIndex: null, difficulty: null },
    ]);
    expect(player.teamStats[0]?.medals).toEqual(player.medals);
    const json = JSON.stringify(result);
    expect(json).not.toContain("MatchInfo");
    expect(json).not.toContain("CoreStats");
    expect(JSON.stringify(matches)).toBe(originalJson);
  });

  it("counts raw substitute participation separately from collapsed completed games", () => {
    const playerId = "xuid(1111111111)";
    const matches = [
      aStableMatchWith("split-one", "2026-11-01T10:00:00.000Z", "same-map", "slayer", [
        MatchOutcome.Win,
        MatchOutcome.Loss,
      ]),
      markPlayerAsSub(
        aStableMatchWith("split-two", "2026-11-01T10:05:00.000Z", "same-map", "slayer", [
          MatchOutcome.Tie,
          MatchOutcome.Win,
        ]),
        playerId,
      ),
      aStableMatchWith("next-game", "2026-11-01T10:10:00.000Z", "next-map", "slayer", [
        MatchOutcome.Tie,
        MatchOutcome.Tie,
      ]),
    ];
    const bot = aFakePlayerWith({
      PlayerId: "bid(77)",
      PlayerType: 2,
      LastTeamId: 17,
      ParticipationInfo: {
        ...aFakePlayerWith().ParticipationInfo,
        PresentAtBeginning: false,
        JoinedInProgress: true,
      },
      PlayerTeamStats: [
        {
          TeamId: 17,
          Stats: createStats("slayer", aFakeCoreStatsWith()),
        },
      ],
    });
    const splitMatch = Preconditions.checkExists(matches[1]);
    const matchesWithSubOnly = [
      Preconditions.checkExists(matches[0]),
      { ...splitMatch, Players: [...splitMatch.Players, bot] },
      Preconditions.checkExists(matches[2]),
    ];
    const result = getResolvedAggregation(mapSeriesDetailAggregation(matchesWithSubOnly));
    expect(result).toMatchObject({ gamesPlayed: 3, completedGameCount: 2 });
    expect(
      result.teams.map(({ seriesTeamId, gamesPlayed, gamesWon, outcome }) => ({
        seriesTeamId,
        gamesPlayed,
        gamesWon,
        outcome,
      })),
    ).toEqual([
      { seriesTeamId: 17, gamesPlayed: 3, gamesWon: 0, outcome: "Tie" },
      { seriesTeamId: 4, gamesPlayed: 3, gamesWon: 1, outcome: "Win" },
    ]);
    const substitute = Preconditions.checkExists(result.players.find(({ playerId: id }) => id === playerId));
    expect(substitute.gamesPlayed).toBe(3);
    expect(substitute.teamStats[0]?.gamesPlayed).toBe(3);
    const subOnlyBot = Preconditions.checkExists(result.players.find(({ playerId: id }) => id === "bid(77)"));
    expect(subOnlyBot).toMatchObject({ playerId: "bid(77)", playerType: 2, gamesPlayed: 1, gamertag: null });
    expect(subOnlyBot).not.toHaveProperty("xuid");
    expect(subOnlyBot.stats).toEqual([]);
    expect(subOnlyBot.teamStats).toEqual([{ seriesTeamId: 17, gamesPlayed: 1, stats: [], medals: [] }]);
  });

  it("maps unknown team outcomes through the existing outcome helper", () => {
    const match = aStableMatchWith("unknown-outcome", "2026-11-01T10:00:00.000Z", "unknown-map", "slayer", [0, 0]);

    const result = getResolvedAggregation(mapSeriesDetailAggregation([match]));
    expect(result.teams.map(({ outcome }) => outcome)).toEqual(["Unknown", "Unknown"]);
  });
});
