import { GameVariantCategory } from "halo-infinite-api";
import type { MatchStats } from "halo-infinite-api";
import { describe, expect, it } from "vitest";
import { Preconditions } from "../../base/preconditions";
import {
  aFakeCoreStatsWith,
  aFakeCtfStatsWith,
  aFakeMatchStatsWith,
  aFakePlayerWith,
  aFakeTeamWith,
} from "../fakes/data";
import { calculateSeriesPlayerStats, calculateSeriesTeamStats } from "../series-stat-calculation";
import { StatsValueSortBy } from "../stat-formatting";

describe("series stat calculations", () => {
  it("returns exact unformatted team and player columns, ordering, comparisons and medals", () => {
    const match = aFakeMatchStatsWith();
    const teams = calculateSeriesTeamStats([match]);
    const players = calculateSeriesPlayerStats([match]);
    const team = Preconditions.checkExists(teams.teams[0]);
    const playerTeam = Preconditions.checkExists(players.teams[0]);
    const player = Preconditions.checkExists(playerTeam.players[0]);
    expect(teams.teams.map((entry) => entry.teamId)).toEqual([0, 1]);
    expect(team.players.map((entry) => entry.player.PlayerId)).toEqual(["xuid(1111111111)", "xuid(2222222222)"]);
    expect(playerTeam.players.map((entry) => entry.player.PlayerId)).toEqual(["xuid(1111111111)", "xuid(2222222222)"]);
    expect(Array.from(player.values, ([key, stat]) => [key, stat.value])).toEqual([
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
    expect(players.bestValues.get("Kills")).toBe(25);
    expect(playerTeam.bestPlayerValues.get("Deaths")).toBe(12);
    expect(teams.bestValues.get("Kills")).toBe(50);
    expect(player.gamesPlayed).toBe(1);
    expect(player.coreStats.Medals).toEqual(match.Players[0]?.PlayerTeamStats[0]?.Stats.CoreStats.Medals);
    expect([...player.values.values(), ...team.values.values()].every((value) => value.display === undefined)).toBe(
      true,
    );
  });

  it("preserves participation, series-length averaging, ratios and first-appearance roster ordering", () => {
    const player = aFakePlayerWith({
      PlayerId: "xuid(1)",
      LastTeamId: 7,
      PlayerTeamStats: [
        {
          TeamId: 7,
          Stats: {
            CoreStats: aFakeCoreStatsWith({
              Kills: 8,
              Accuracy: 60,
              DamageDealt: 10,
              DamageTaken: 0,
              PersonalScore: 100,
            }),
          },
        },
      ],
    });
    const bot = aFakePlayerWith({ PlayerId: "bot(2)", PlayerType: 2, LastTeamId: 7, Rank: 2 });
    const late = aFakePlayerWith({
      PlayerId: "xuid(3)",
      LastTeamId: 7,
      ParticipationInfo: { ...player.ParticipationInfo, PresentAtBeginning: false },
    });
    const first = aFakeMatchStatsWith({ Teams: [aFakeTeamWith({ TeamId: 7 })], Players: [player, late] });
    const second = aFakeMatchStatsWith({ Teams: [aFakeTeamWith({ TeamId: 7 })], Players: [bot] });
    const calculated = calculateSeriesPlayerStats([first, second]);
    const team = Preconditions.checkExists(calculated.teams[0]);
    const partial = Preconditions.checkExists(team.players.find((entry) => entry.player.PlayerId === "xuid(1)"));
    expect(team.players.map((entry) => entry.player.PlayerId)).toEqual(["bot(2)", "xuid(1)"]);
    expect(partial.gamesPlayed).toBe(1);
    expect(partial.values.get("Accuracy")?.value).toBe(30);
    expect(partial.values.get("Damage ratio")?.value).toBe(Number.POSITIVE_INFINITY);
    expect(calculateSeriesTeamStats([first, second]).teams[0]?.players.map(({ player: p }) => p.PlayerId)).toEqual([
      "xuid(1)",
      "bot(2)",
    ]);
  });

  it("keeps anchored team totals on side swaps", () => {
    const first = aFakeMatchStatsWith({
      Teams: [
        aFakeTeamWith({ TeamId: 7, Stats: { CoreStats: aFakeCoreStatsWith({ Kills: 10 }) } }),
        aFakeTeamWith({ TeamId: 9, Stats: { CoreStats: aFakeCoreStatsWith({ Kills: 20 }) } }),
      ],
      Players: [
        aFakePlayerWith({ PlayerId: "xuid(1)", LastTeamId: 7 }),
        aFakePlayerWith({ PlayerId: "xuid(2)", LastTeamId: 9 }),
      ],
    });
    const second = aFakeMatchStatsWith({
      Teams: [
        aFakeTeamWith({ TeamId: 7, Stats: { CoreStats: aFakeCoreStatsWith({ Kills: 30 }) } }),
        aFakeTeamWith({ TeamId: 9, Stats: { CoreStats: aFakeCoreStatsWith({ Kills: 40 }) } }),
      ],
      Players: [
        aFakePlayerWith({ PlayerId: "xuid(1)", LastTeamId: 9 }),
        aFakePlayerWith({ PlayerId: "xuid(2)", LastTeamId: 7 }),
      ],
    });
    const result = calculateSeriesTeamStats([first, second]);
    expect(result.teams.map((team) => [team.teamId, team.values.get("Kills")?.value])).toEqual([
      [7, 50],
      [9, 50],
    ]);
  });

  it("returns mixed-mode objective values and non-comparable zero-denominator contribution", () => {
    const info = aFakeMatchStatsWith().MatchInfo;
    const makeObjective = (teamTime: string, playerTime: string): MatchStats =>
      aFakeMatchStatsWith({
        MatchInfo: { ...info, GameVariantCategory: GameVariantCategory.MultiplayerCtf },
        Teams: [aFakeTeamWith({ TeamId: 7, Stats: aFakeCtfStatsWith({ TimeAsFlagCarrier: teamTime }) })],
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1)",
            LastTeamId: 7,
            PlayerTeamStats: [{ TeamId: 7, Stats: aFakeCtfStatsWith({ TimeAsFlagCarrier: playerTime }) }],
          }),
        ],
      });
    const slayer = aFakeMatchStatsWith({
      Teams: [aFakeTeamWith({ TeamId: 7 })],
      Players: [aFakePlayerWith({ PlayerId: "xuid(1)", LastTeamId: 7 })],
    });
    const result = calculateSeriesPlayerStats([
      makeObjective("PT60S", "PT30S"),
      slayer,
      makeObjective("PT0S", "PT10S"),
    ]);
    const player = Preconditions.checkExists(result.teams[0]?.players[0]);
    expect(player.gamesPlayed).toBe(3);
    expect(player.objectiveSummary).toEqual({
      objectiveTimeSeconds: 40,
      objectiveGamesPlayed: 2,
      objectiveTeamContribution: 0.5,
      objectiveTeamContributionGamesPlayed: 1,
    });
    expect(player.values.get("Objective time")).toEqual({ value: 40, sortBy: StatsValueSortBy.DESC });
    expect(player.values.get("Team objective contribution")).toEqual({
      value: 0.5,
      sortBy: StatsValueSortBy.DESC,
      isComparable: true,
    });
    const zero = calculateSeriesPlayerStats([makeObjective("PT0S", "PT10S")]);
    expect(zero.teams[0]?.players[0]?.values.get("Team objective contribution")).toEqual({
      value: 0,
      sortBy: StatsValueSortBy.DESC,
      isComparable: false,
    });
    expect(zero.bestValues.has("Team objective contribution")).toBe(false);
  });

  it("rejects empty series", () => {
    expect(() => calculateSeriesPlayerStats([])).toThrow("No matches found");
    expect(() => calculateSeriesTeamStats([])).toThrow("No matches found");
  });
});
