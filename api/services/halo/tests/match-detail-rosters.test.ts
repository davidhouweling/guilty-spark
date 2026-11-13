import { describe, expect, it } from "vitest";
import { GameVariantCategory, MatchOutcome } from "halo-infinite-api";
import type { Stats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { playerSchema, teamSchema } from "@guilty-spark/shared/contracts/stats/detail-primitives";
import {
  aFakeCoreStatsWith,
  aFakeMatchStatsWith,
  aFakePlayerWith,
  aFakeTeamWith,
} from "@guilty-spark/shared/halo/fakes/data";
import { aFakeMedalMetadataWith } from "@guilty-spark/shared/halo/fakes/medal-metadata.fake";
import { mapMatchDetailRosters } from "../match-detail-rosters";

describe("mapMatchDetailRosters", () => {
  it.each([false, true])("matches raw player/team IDs independently of source order (reversed %s)", (reversed) => {
    const players = [
      aFakePlayerWith({
        PlayerId: "xuid(12)",
        LastTeamId: 7,
        Rank: 2,
        PlayerTeamStats: [{ TeamId: 7, Stats: { CoreStats: aFakeCoreStatsWith({ Kills: 12 }) } }],
      }),
      aFakePlayerWith({
        PlayerId: "xuid(34)",
        LastTeamId: 3,
        Rank: 1,
        PlayerTeamStats: [{ TeamId: 3, Stats: { CoreStats: aFakeCoreStatsWith({ Kills: 34 }) } }],
      }),
    ];
    const teams = [aFakeTeamWith({ TeamId: 7 }), aFakeTeamWith({ TeamId: 3 })];
    const result = mapMatchDetailRosters(
      aFakeMatchStatsWith({
        Players: reversed ? players.reverse() : players,
        Teams: reversed ? teams.reverse() : teams,
      }),
      {
        identitiesByPlayerId: new Map([
          ["xuid(12)", { gamertag: "Resolved name", discordUserId: "1234" }],
          ["xuid(34)", { gamertag: "Resolved name" }],
        ]),
        matchTeamIdToSeriesTeamId: new Map([
          [7, 3],
          [3, 7],
        ]),
      },
    );
    const first = Preconditions.checkExists(result.players.find((player) => player.playerId === "xuid(12)"));
    const second = Preconditions.checkExists(result.players.find((player) => player.playerId === "xuid(34)"));
    expect(first).toMatchObject({ xuid: "12", discordUserId: "1234", gamertag: "Resolved name", lastMatchTeamId: 7 });
    expect(first.teamStats[0]).toMatchObject({ matchTeamId: 7, seriesTeamId: 3 });
    expect(first.teamStats[0]?.stats.find((stat) => stat.key === "Kills")).toMatchObject({ value: 12 });
    expect(second.teamStats[0]).toMatchObject({ matchTeamId: 3, seriesTeamId: 7 });
    expect(second.teamStats[0]?.stats.find((stat) => stat.key === "Kills")).toMatchObject({ value: 34 });
    expect(result.teams.find((team) => team.matchTeamId === 7)?.playerIds).toEqual(["xuid(12)"]);
    expect(result.teams.map((team) => team.matchTeamId)).toEqual(reversed ? [3, 7] : [7, 3]);
  });

  it("preserves first-entry numeric policy and selected-team medals for multiple team entries", () => {
    const firstCore = aFakeCoreStatsWith({
      Kills: 8,
      Medals: [{ NameId: 1, Count: 2, TotalPersonalScoreAwarded: 100 }],
    });
    const secondCore = aFakeCoreStatsWith({
      Kills: 99,
      Medals: [{ NameId: 2, Count: 3, TotalPersonalScoreAwarded: 200 }],
    });
    const result = mapMatchDetailRosters(
      aFakeMatchStatsWith({
        Teams: [aFakeTeamWith({ TeamId: 7 }), aFakeTeamWith({ TeamId: 3 })],
        Players: [
          aFakePlayerWith({
            LastTeamId: 7,
            PlayerTeamStats: [
              { TeamId: 3, Stats: { CoreStats: firstCore } },
              { TeamId: 7, Stats: { CoreStats: secondCore } },
            ],
          }),
        ],
      }),
    );
    const player = Preconditions.checkExists(result.players[0]);
    expect(player.teamStats.map((row) => row.matchTeamId)).toEqual([7, 3]);
    expect(player.teamStats.map((row) => row.stats.find((stat) => stat.key === "Kills"))).toEqual([
      expect.objectContaining({ value: 8 }),
      expect.objectContaining({ value: 8 }),
    ]);
    expect(player.teamStats.map((row) => row.medals[0]?.id)).toEqual([2, 1]);
    expect(result.teams.map((team) => team.playerIds)).toEqual([[player.playerId], [player.playerId]]);
    expect(result.teams.map((team) => team.seriesTeamId)).toEqual([null, null]);
  });

  it("retains bots, unresolved identities, and late participation without fabricating late stat rows", () => {
    const late = aFakePlayerWith({
      PlayerId: "xuid(55)",
      PlayerTeamStats: [],
      ParticipationInfo: {
        ...aFakePlayerWith().ParticipationInfo,
        PresentAtBeginning: false,
        JoinedInProgress: true,
        LeftInProgress: true,
        PresentAtCompletion: false,
      },
    });
    const result = mapMatchDetailRosters(
      aFakeMatchStatsWith({
        Teams: [aFakeTeamWith()],
        Players: [
          aFakePlayerWith({ PlayerId: "bid(7)", PlayerType: 2 }),
          late,
          aFakePlayerWith({ PlayerId: "unresolved" }),
        ],
      }),
    );
    expect(result.players.map((player) => player.playerId)).toEqual(["bid(7)", "xuid(55)", "unresolved"]);
    expect(result.players[0]).toMatchObject({ gamertag: null, playerType: 2 });
    expect(result.players[0]).not.toHaveProperty("xuid");
    expect(result.players[2]).not.toHaveProperty("xuid");
    expect(result.players[2]?.teamStats).toHaveLength(1);
    expect(result.players[1]).toMatchObject({
      xuid: "55",
      teamStats: [],
      participation: {
        presentAtBeginning: false,
        joinedInProgress: true,
        leftInProgress: true,
        presentAtCompletion: false,
      },
    });
    expect(result.teams[0]?.playerIds).toEqual(["bid(7)", "xuid(55)", "unresolved"]);
  });

  it.each([
    [MatchOutcome.Win, "Win"],
    [MatchOutcome.Loss, "Loss"],
    [MatchOutcome.Tie, "Tie"],
    [MatchOutcome.DidNotFinish, "DNF"],
  ])("maps raw outcome %s to tracker outcome %s", (outcome, expected) => {
    const result = mapMatchDetailRosters(
      aFakeMatchStatsWith({
        Teams: [aFakeTeamWith({ Outcome: outcome })],
        Players: [aFakePlayerWith({ Outcome: outcome })],
      }),
    );
    expect(result.teams[0]?.outcome).toBe(expected);
    expect(result.players[0]?.outcome).toBe(expected);
  });

  it("preserves already unwrapped XUIDs and unknown team outcomes without resolving names", () => {
    const result = mapMatchDetailRosters(
      aFakeMatchStatsWith({
        Teams: [aFakeTeamWith({ Outcome: 0 })],
        Players: [aFakePlayerWith({ PlayerId: "1234" })],
      }),
    );
    expect(result.teams[0]?.outcome).toBe("Unknown");
    expect(result.players[0]).toMatchObject({ playerId: "1234", xuid: "1234", gamertag: null });
  });

  it("serializes real objective values, medal metadata and unbounded ratios without raw fields", () => {
    const core = aFakeCoreStatsWith({ DamageDealt: 10, DamageTaken: 0 });
    const stats: Stats<GameVariantCategory.MultiplayerOddball> = {
      CoreStats: core,
      PvpStats: { Kills: core.Kills, Deaths: core.Deaths, Assists: core.Assists, KDA: core.KDA },
      OddballStats: {
        SkullGrabs: 2,
        KillsAsSkullCarrier: 3,
        SkullCarriersKilled: 4,
        TimeAsSkullCarrier: "PT5S",
        LongestTimeAsSkullCarrier: "PT2S",
        SkullScoringTicks: 5,
      },
    };
    const source = aFakeMatchStatsWith({
      MatchInfo: { ...aFakeMatchStatsWith().MatchInfo, GameVariantCategory: GameVariantCategory.MultiplayerOddball },
      Teams: [aFakeTeamWith({ Stats: stats })],
      Players: [aFakePlayerWith({ PlayerTeamStats: [{ TeamId: 1, Stats: stats }] })],
    });
    const originalJson = JSON.stringify(source);
    const result = mapMatchDetailRosters(source, {
      medalMetadataById: { 622331684: aFakeMedalMetadataWith() },
      medalDifficulties: ["Normal", "Heroic"],
    });
    const row = Preconditions.checkExists(result.players[0]?.teamStats[0]);
    expect(row.stats.find((stat) => stat.key === "Damage ratio")).toMatchObject({
      status: "unbounded",
      numerator: 10,
      denominator: 0,
    });
    expect(row.stats.find((stat) => stat.key === "Total time as carrier")).toMatchObject({
      value: 5,
      format: "duration-seconds",
    });
    expect(row.medals[0]).toMatchObject({ id: 622331684, name: "Killing Spree", difficulty: "Heroic", count: 6 });
    expect(row.medals[1]).toMatchObject({ id: 1169571763, name: null, difficulty: null });
    expect(result.teams[0]?.medals).toEqual(row.medals);
    const json = JSON.stringify(result);
    expect(JSON.parse(json)).toEqual(result);
    expect(json).not.toMatch(/CoreStats|PlayerTeamStats|TotalPersonalScoreAwarded|BotAttributes|rawMatch|Infinity/);
    expect(playerSchema.parse(result.players[0])).toEqual(result.players[0]);
    expect(teamSchema.parse(result.teams[0])).toEqual(result.teams[0]);
    expect(JSON.stringify(source)).toBe(originalJson);
  });

  it("uses explicit null for missing or ambiguous supplied series mappings", () => {
    const result = mapMatchDetailRosters(aFakeMatchStatsWith(), { matchTeamIdToSeriesTeamId: new Map([[0, null]]) });
    expect(result.teams.map((team) => team.seriesTeamId)).toEqual([null, null]);
    expect(result.players.flatMap((player) => player.teamStats.map((row) => row.seriesTeamId))).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it.each([
    [aFakeMatchStatsWith({ Teams: [aFakeTeamWith(), aFakeTeamWith()] }), "Duplicate match team ID"],
    [aFakeMatchStatsWith({ Players: [aFakePlayerWith(), aFakePlayerWith()] }), "Duplicate raw player ID"],
    [aFakeMatchStatsWith({ Players: [aFakePlayerWith({ PlayerTeamStats: [] })] }), "Missing source team stats"],
    [
      aFakeMatchStatsWith({
        Players: [
          aFakePlayerWith({
            PlayerTeamStats: [
              { TeamId: 1, Stats: { CoreStats: aFakeCoreStatsWith() } },
              { TeamId: 1, Stats: { CoreStats: aFakeCoreStatsWith() } },
            ],
          }),
        ],
      }),
      "Duplicate team stat entry",
    ],
  ])("rejects inconsistent known source identities and rows", (source, error) => {
    expect(() => mapMatchDetailRosters(source)).toThrow(error);
  });

  it("preserves identities without fabricating rows when no team is available", () => {
    const player = aFakePlayerWith({ LastTeamId: 9 });
    const result = mapMatchDetailRosters(aFakeMatchStatsWith({ Teams: [], Players: [player] }));
    expect(result.teams).toEqual([]);
    expect(result.players[0]).toMatchObject({
      playerId: player.PlayerId,
      lastMatchTeamId: null,
      teamStats: [],
    });
  });

  it("preserves unknown membership while keeping known team rows", () => {
    const player = aFakePlayerWith({
      LastTeamId: 9,
      PlayerTeamStats: [{ TeamId: 0, Stats: { CoreStats: aFakeCoreStatsWith() } }],
    });
    const result = mapMatchDetailRosters(aFakeMatchStatsWith({ Players: [player] }));
    expect(result.players[0]?.lastMatchTeamId).toBeNull();
    expect(result.players[0]?.teamStats).not.toHaveLength(0);
  });

  it("retains players whose stat team is absent without fabricating a team", () => {
    const player = aFakePlayerWith({
      LastTeamId: 9,
      PlayerTeamStats: [{ TeamId: 9, Stats: { CoreStats: aFakeCoreStatsWith() } }],
    });
    const result = mapMatchDetailRosters(aFakeMatchStatsWith({ Players: [player] }));
    expect(result.players[0]).toMatchObject({ playerId: player.PlayerId, lastMatchTeamId: null, teamStats: [] });
  });

  it("rejects mappings for missing teams, malformed mapped IDs and known modes missing objective data", () => {
    expect(() =>
      mapMatchDetailRosters(aFakeMatchStatsWith(), { matchTeamIdToSeriesTeamId: new Map([[9, 1]]) }),
    ).toThrow("Series mapping references missing match team 9");
    expect(() =>
      mapMatchDetailRosters(aFakeMatchStatsWith(), { matchTeamIdToSeriesTeamId: new Map([[0, 0.5]]) }),
    ).toThrow();
    expect(() =>
      mapMatchDetailRosters(
        aFakeMatchStatsWith({
          MatchInfo: { ...aFakeMatchStatsWith().MatchInfo, GameVariantCategory: GameVariantCategory.MultiplayerCtf },
        }),
      ),
    ).toThrow("CTF stats require CaptureTheFlagStats");
  });
});
