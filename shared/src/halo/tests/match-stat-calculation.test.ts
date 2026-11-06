import { describe, expect, it } from "vitest";
import { Preconditions } from "../../base/preconditions";
import { calculateMatchStats } from "../match-stat-calculation";
import { getPlayerSlayerStatValues } from "../slayer-stats";
import { StatsValueSortBy } from "../stat-formatting";
import { aFakeCoreStatsWith, aFakeMatchStatsWith, aFakePlayerWith, aFakeTeamWith } from "../fakes/data";

describe("calculateMatchStats", () => {
  it("returns exact numeric Slayer columns and comparison values in existing team and rank order", () => {
    const result = calculateMatchStats(aFakeMatchStatsWith());
    expect(result.teams.map((team) => team.teamId)).toEqual([0, 1]);
    const team = Preconditions.checkExists(result.teams[0]);
    const player = Preconditions.checkExists(team.players[0]);
    expect(Array.from(player.values, ([key, stat]) => [key, stat.value])).toEqual([
      ["Rank", 3],
      ["Score", 1500],
      ["Kills", 10],
      ["Deaths", 15],
      ["Assists", 5],
      ["KDA", 15],
      ["Headshot kills", 30],
      ["Shots hit", 371],
      ["Shots fired", 712],
      ["Accuracy", 52.1],
      ["Damage dealt", 17849],
      ["Damage taken", 17356],
      ["Damage ratio", 17849 / 17356],
      ["Avg life time", 38.1],
      ["Avg damage per life", 17849 / 16],
    ]);
    expect(Array.from(team.values, ([key, stat]) => [key, stat.value])).toEqual([
      ["Rank", 2],
      ["Score", 6600],
      ["Kills", 50],
      ["Deaths", 44],
      ["Assists", 27],
      ["KDA", 15],
      ["Headshot kills", 30],
      ["Shots hit", 371],
      ["Shots fired", 712],
      ["Accuracy", 52.1],
      ["Damage dealt", 17849],
      ["Damage taken", 17356],
      ["Damage ratio", 17849 / 17356],
      ["Avg life time", 38.1],
      ["Avg damage per life", 17849 / 45],
    ]);
    expect(result.teams.map((entry) => entry.players.map(({ player: source }) => source.PlayerId))).toEqual([
      ["xuid(1111111111)", "xuid(2222222222)"],
      ["xuid(3333333333)", "xuid(4444444444)"],
    ]);
    expect(result.bestPlayerValues.get("Kills")).toBe(25);
    expect(result.bestPlayerValues.get("Deaths")).toBe(10);
    expect(result.bestTeamValues.get("Rank")).toBe(1);
    expect(team.bestPlayerValues.get("Kills")).toBe(10);
    expect(Array.from(player.values.values()).every((stat) => stat.display === undefined)).toBe(true);
  });

  it("keeps bots, excludes late joiners, and sorts tied ranks by selected-team score", () => {
    const bot = aFakePlayerWith({ PlayerId: "bot(7)", PlayerType: 2, LastTeamId: 7 });
    const highScore = aFakePlayerWith({
      PlayerId: "xuid(7)",
      LastTeamId: 7,
      PlayerTeamStats: [
        { TeamId: 7, Stats: { ...bot.PlayerTeamStats[0]?.Stats, CoreStats: aFakeCoreStatsWith({ Score: 99 }) } },
      ],
    });
    const late = aFakePlayerWith({
      PlayerId: "xuid(8)",
      LastTeamId: 7,
      ParticipationInfo: { ...bot.ParticipationInfo, PresentAtBeginning: false },
    });
    const result = calculateMatchStats(
      aFakeMatchStatsWith({
        Teams: [aFakeTeamWith({ TeamId: 7 })],
        Players: [bot, late, highScore],
      }),
    );
    expect(result.teams[0]?.players.map(({ player }) => player.PlayerId)).toEqual(["xuid(7)", "bot(7)"]);
  });

  it("preserves first-entry numeric stats but selected-team medals for multi-team players", () => {
    const first = aFakeCoreStatsWith({ Kills: 8, Medals: [] });
    const selected = aFakeCoreStatsWith({ Kills: 99 });
    const result = calculateMatchStats(
      aFakeMatchStatsWith({
        Teams: [aFakeTeamWith({ TeamId: 7 })],
        Players: [
          aFakePlayerWith({
            LastTeamId: 3,
            PlayerTeamStats: [
              { TeamId: 3, Stats: { CoreStats: first } },
              { TeamId: 7, Stats: { CoreStats: selected } },
            ],
          }),
        ],
      }),
    );
    const team = Preconditions.checkExists(result.teams[0]);
    const player = Preconditions.checkExists(team.players[0]);
    expect(player.values.get("Kills")?.value).toBe(8);
    expect(player.coreStats).toEqual(first);
    expect(player.medalStats.Medals).toEqual(selected.Medals);
  });

  it("merges existing objective columns without comparing explicitly non-comparable values", () => {
    const result = calculateMatchStats(
      aFakeMatchStatsWith(),
      () => new Map([["Objective", { value: 9, sortBy: StatsValueSortBy.DESC, isComparable: false }]]),
    );
    expect(result.teams[0]?.values.get("Objective")?.value).toBe(9);
    expect(result.bestTeamValues.has("Objective")).toBe(false);
    expect(result.bestPlayerValues.has("Objective")).toBe(false);
  });

  it("rejects a participating player with no stat entry", () => {
    const match = aFakeMatchStatsWith({ Players: [aFakePlayerWith({ PlayerTeamStats: [] })] });
    expect(() => calculateMatchStats(match)).toThrow();
  });
});

describe("getPlayerSlayerStatValues", () => {
  it.each([
    [0, 0, 0],
    [5, 0, Number.POSITIVE_INFINITY],
    [0, 5, 0],
    [5, 2, 2.5],
  ])("preserves ratio policy for damage %s and taken %s", (DamageDealt, DamageTaken, expected) => {
    const values = getPlayerSlayerStatValues(aFakeCoreStatsWith({ DamageDealt, DamageTaken, Deaths: 0 }));
    expect(values.get("Damage ratio")).toEqual({ value: expected, sortBy: StatsValueSortBy.DESC });
    expect(values.get("Avg damage per life")?.value).toBe(DamageDealt);
  });
});
