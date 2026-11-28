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
  it("orders each team by its calculated aggregate scores and retains uncalculated roster identities", () => {
    function player(
      id: string,
      teamScores: readonly [number, number, number][],
      options: { late?: boolean; lastTeamId?: number; playerType?: number } = {},
    ): MatchStats["Players"][number] {
      const base = aFakePlayerWith();
      return aFakePlayerWith({
        PlayerId: id,
        PlayerType: options.playerType ?? base.PlayerType,
        Rank: id === "raw-high" ? 0 : 99,
        LastTeamId: options.lastTeamId ?? 17,
        ParticipationInfo: { ...base.ParticipationInfo, PresentAtBeginning: options.late !== true },
        PlayerTeamStats: teamScores.map(([teamId, score, personalScore]) => ({
          TeamId: teamId,
          Stats: createStats("slayer", aFakeCoreStatsWith({ Score: score, PersonalScore: personalScore })),
        })),
      });
    }

    const first = aStableMatchWith("first", "2026-11-01T10:00:00.000Z", "first-map", "slayer", [1, 2]);
    const second = aStableMatchWith("second", "2026-11-01T10:10:00.000Z", "second-map", "slayer", [1, 2]);
    const matches = [
      {
        ...first,
        Players: [
          player("late-no-stats", [], { late: true }),
          player("late-then-scored", [[17, 999, 999]], { late: true }),
          player(
            "switcher",
            [
              [17, 9, 100],
              [4, 40, 1000],
            ],
            { lastTeamId: 4 },
          ),
          player("tie-first", [[17, 10, 200]]),
          player("raw-high", [[17, 11, 9999]]),
          player("tie-second", [[17, 10, 200]]),
          player("personal-high", [[17, 10, 300]]),
          player("other-team", [[4, 42, 0]], { lastTeamId: 4 }),
          player("migrant", [[4, 50, 0]], { lastTeamId: 4 }),
          player("negative", [[17, -1, 0]]),
          player("bid(77)", [[17, 999, 999]], { late: true, playerType: 2 }),
        ],
      },
      {
        ...second,
        Players: [
          player("switcher", [
            [4, 1, 0],
            [17, 20, 0],
          ]),
          player("tie-first", [[17, 2, 0]]),
          player("tie-second", [[17, 2, 0]]),
          player("raw-high", [[17, 0, 0]]),
          player("personal-high", [[17, 2, 200]]),
          player("late-then-scored", [[17, 12, 200]]),
          player("migrant", [[17, 2, 0]]),
        ],
      },
    ];
    const original = JSON.stringify(matches);

    const result = getResolvedAggregation(mapSeriesDetailAggregation(matches));

    expect(result.teams.map(({ seriesTeamId, playerIds }) => ({ seriesTeamId, playerIds }))).toEqual([
      {
        seriesTeamId: 17,
        playerIds: [
          "switcher",
          "personal-high",
          "late-then-scored",
          "tie-first",
          "tie-second",
          "raw-high",
          "migrant",
          "negative",
          "late-no-stats",
          "bid(77)",
        ],
      },
      { seriesTeamId: 4, playerIds: ["migrant", "other-team", "switcher"] },
    ]);
    expect(
      result.players.find(({ playerId }) => playerId === "switcher")?.teamStats.map(({ seriesTeamId }) => seriesTeamId),
    ).toEqual([17, 4]);
    expect(result.players.find(({ playerId }) => playerId === "bid(77)")).toMatchObject({
      playerType: 2,
      stats: [],
      teamStats: [{ seriesTeamId: 17, stats: [] }],
    });
    expect(JSON.stringify(result)).not.toMatch(/CoreStats|PlayerTeamStats|MatchInfo/);
    expect(JSON.stringify(matches)).toBe(original);
  });

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
      {
        id: 622331684,
        count: 5,
        name: null,
        sortingWeight: null,
        totalPersonalScoreAwarded: 40,
        difficultyIndex: null,
        difficulty: null,
      },
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
