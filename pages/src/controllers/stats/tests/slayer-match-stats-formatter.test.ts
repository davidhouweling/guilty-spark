import { describe, expect, it } from "vitest";
import { SlayerMatchStatsFormatter } from "../slayer-match-stats-formatter";
import {
  aFakeCoreStatsWith,
  aFakeMatchStatsWith,
  aFakeMedalMetadata,
  aFakePlayerWith,
  aFakeTeamWith,
} from "../fakes/data";

describe("SlayerMatchStatsFormatter", () => {
  it("preserves fixture display values, best flags, player order, missing names and medal aggregation", () => {
    const result = new SlayerMatchStatsFormatter().getData(
      aFakeMatchStatsWith(),
      new Map([
        ["1111111111", "Alpha"],
        ["3333333333", "Charlie"],
        ["4444444444", "Delta"],
      ]),
      aFakeMedalMetadata(),
    );
    expect(result.map((team) => team.players.map((player) => player.name))).toEqual([
      ["Alpha", "*Unknown*"],
      ["Charlie", "Delta"],
    ]);
    const [team] = result;
    const [player] = team.players;
    expect(player.values.map(({ name, value, display }) => [name, value, display])).toEqual([
      ["Rank", 3, "3"],
      ["Score", 1500, "1,500"],
      ["Kills", 10, "10"],
      ["Deaths", 15, "15"],
      ["Assists", 5, "5"],
      ["KDA", 15, "15"],
      ["Headshot kills", 30, "30"],
      ["Shots hit", 371, "371"],
      ["Shots fired", 712, "712"],
      ["Accuracy", 52.1, "52.1%"],
      ["Damage dealt", 17849, "17,849"],
      ["Damage taken", 17356, "17,356"],
      ["Damage ratio", 17849 / 17356, "1.03"],
      ["Avg life time", 38.1, "38s"],
      ["Avg damage per life", 17849 / 16, "1,115.56"],
    ]);
    expect(player.values.find((stat) => stat.name === "Kills")).toEqual({
      name: "Kills",
      value: 10,
      display: "10",
      bestInTeam: true,
      bestInMatch: false,
    });
    expect(team.teamStats.find((stat) => stat.name === "Kills")).toEqual({
      name: "Kills",
      value: 50,
      display: "50",
      bestInTeam: false,
      bestInMatch: true,
    });
    expect(team.teamMedals).toEqual(player.medals.map((medal) => ({ ...medal, count: medal.count * 2 })));
  });

  it("preserves bot naming, infinity display, average-life policy and unknown medal fallback", () => {
    const core = aFakeCoreStatsWith({
      DamageDealt: 5,
      DamageTaken: 0,
      Deaths: 0,
      AverageLifeDuration: "PT1M59.99S",
      Medals: [{ NameId: 7, Count: 2, TotalPersonalScoreAwarded: 10 }],
    });
    const match = aFakeMatchStatsWith({
      Teams: [aFakeTeamWith({ TeamId: 7 })],
      Players: [
        aFakePlayerWith({
          PlayerId: "bot(7)",
          PlayerType: 2,
          LastTeamId: 7,
          PlayerTeamStats: [{ TeamId: 7, Stats: { CoreStats: core } }],
        }),
      ],
    });
    const [team] = new SlayerMatchStatsFormatter().getData(match, new Map());
    const [player] = team.players;
    expect(player.name).toBe("Bot");
    expect(player.values.find((stat) => stat.name === "Damage ratio")).toEqual({
      name: "Damage ratio",
      value: Infinity,
      display: "♾️",
      bestInTeam: true,
      bestInMatch: true,
    });
    expect(player.values.find((stat) => stat.name === "Avg life time")?.display).toBe("1m 59s");
    expect(player.values.find((stat) => stat.name === "Avg damage per life")?.value).toBe(5);
    expect(player.medals).toEqual([{ name: "7", count: 2, sortingWeight: 10 }]);
    expect(team.teamMedals).toEqual(player.medals);
  });
});
