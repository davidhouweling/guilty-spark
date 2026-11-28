import { describe, expect, it } from "vitest";
import { aFakeMatchDetailWith } from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import {
  aFakeMedalWith,
  aFakePlayerTeamStatsWith,
  aFakePlayerWith,
  aFakeStatWith,
  aFakeTeamWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail-primitives.fake";
import { StatsDetailController } from "../../../../controllers/stats/stats-detail-controller";
import { projectStandaloneMatchStats } from "../standalone-match-stats";

describe("projectStandaloneMatchStats", () => {
  it("joins team and player medals by IDs while preserving eligible order and formatted stats", () => {
    const switching = aFakePlayerWith({
      playerId: "switch",
      gamertag: "Same",
      teamStats: [
        aFakePlayerTeamStatsWith({
          matchTeamId: 7,
          stats: [aFakeStatWith({ value: 7 })],
          medals: [aFakeMedalWith({ name: "Shared", sortingWeight: 20, count: 2 })],
        }),
        aFakePlayerTeamStatsWith({
          matchTeamId: 42,
          stats: [aFakeStatWith({ value: 42 })],
          medals: [aFakeMedalWith({ name: "Other", sortingWeight: 80 })],
        }),
      ],
    });
    const duplicateName = aFakePlayerWith({
      playerId: "second",
      gamertag: "Same",
      teamStats: [
        aFakePlayerTeamStatsWith({
          matchTeamId: 7,
          stats: [aFakeStatWith({ value: 10 })],
          medals: [
            aFakeMedalWith({ id: 8, name: null, sortingWeight: null, totalPersonalScoreAwarded: 0 }),
            aFakeMedalWith({ name: "Shared", sortingWeight: 100, count: 3 }),
          ],
        }),
      ],
    });
    const late = aFakePlayerWith({
      playerId: "late",
      participation: { ...switching.participation, presentAtBeginning: false },
      teamStats: [
        aFakePlayerTeamStatsWith({
          stats: [aFakeStatWith({ value: 999 })],
          medals: [aFakeMedalWith({ sortingWeight: null })],
        }),
      ],
    });
    const detail = aFakeMatchDetailWith({
      teamCount: 2,
      teams: [
        aFakeTeamWith({ matchTeamId: 42, playerIds: ["switch"], stats: [aFakeStatWith({ value: 50 })] }),
        aFakeTeamWith({
          matchTeamId: 7,
          playerIds: ["switch", "late", "missing", "second"],
          stats: [aFakeStatWith({ value: 20 })],
          medals: [aFakeMedalWith({ name: "Not used" })],
        }),
      ],
      players: [late, duplicateName, switching],
    });

    const result = projectStandaloneMatchStats(detail, new StatsDetailController("en-US"));
    expect(result.hasUnknownRarity).toBe(false);
    expect(result.teams.map((team) => team.teamId)).toEqual([42, 7]);
    expect(result.teams.map((team) => team.teamStats[0])).toEqual([
      expect.objectContaining({ value: 50, display: "50", bestInMatch: true }),
      expect.objectContaining({ value: 20, display: "20", bestInMatch: false }),
    ]);
    expect(result.teams.map((team) => team.players.map(({ playerId, name }) => [playerId, name]))).toEqual([
      [["switch", "Same"]],
      [
        ["switch", "Same"],
        ["second", "Same"],
      ],
    ]);
    expect(result.teams.map((team) => team.players.map((player) => player.values[0]))).toEqual([
      [expect.objectContaining({ value: 42, display: "42", bestInTeam: true, bestInMatch: true })],
      [
        expect.objectContaining({ value: 7, display: "7", bestInTeam: false, bestInMatch: false }),
        expect.objectContaining({ value: 10, display: "10", bestInTeam: true, bestInMatch: false }),
      ],
    ]);
    expect(result.teams[0].teamMedals).toEqual([{ name: "Other", count: 2, sortingWeight: 80 }]);
    expect(result.teams[1].teamMedals).toEqual([
      { name: "Shared", count: 5, sortingWeight: 20 },
      { name: "8", count: 2, sortingWeight: 0 },
    ]);
    expect(result.teams[1].players.map((player) => player.medals)).toEqual([
      [{ name: "Shared", count: 2, sortingWeight: 20 }],
      [
        { name: "Shared", count: 3, sortingWeight: 100 },
        { name: "8", count: 2, sortingWeight: 0 },
      ],
    ]);
  });

  it("omits only medals without rarity and reports the affected player, team, and match", () => {
    const detail = aFakeMatchDetailWith({
      teams: [aFakeTeamWith({ playerIds: ["unknown", "known"] })],
      players: [
        aFakePlayerWith({
          playerId: "known",
          teamStats: [
            aFakePlayerTeamStatsWith({
              medals: [aFakeMedalWith({ name: "Zero", sortingWeight: null, totalPersonalScoreAwarded: 0 })],
            }),
          ],
        }),
        aFakePlayerWith({
          playerId: "unknown",
          teamStats: [
            aFakePlayerTeamStatsWith({
              medals: [
                aFakeMedalWith({ name: "Omitted", sortingWeight: null }),
                aFakeMedalWith({ name: "Known", sortingWeight: 50, totalPersonalScoreAwarded: 90 }),
              ],
            }),
          ],
        }),
      ],
    });
    const result = projectStandaloneMatchStats(detail, new StatsDetailController());
    const [team] = result.teams;
    expect(result.hasUnknownRarity).toBe(true);
    expect(team.hasUnknownRarity).toBe(true);
    expect(
      team.players.map(({ playerId, medals, hasUnknownRarity }) => ({ playerId, medals, hasUnknownRarity })),
    ).toEqual([
      { playerId: "unknown", medals: [{ name: "Known", count: 2, sortingWeight: 50 }], hasUnknownRarity: true },
      { playerId: "known", medals: [{ name: "Zero", count: 2, sortingWeight: 0 }], hasUnknownRarity: false },
    ]);
    expect(team.teamMedals).toEqual([
      { name: "Known", count: 2, sortingWeight: 50 },
      { name: "Zero", count: 2, sortingWeight: 0 },
    ]);
  });
});
