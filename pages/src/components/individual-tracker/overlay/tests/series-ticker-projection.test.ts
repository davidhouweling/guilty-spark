import { describe, expect, it } from "vitest";
import type { SeriesAggregation } from "@guilty-spark/shared/contracts/stats/detail";
import {
  aFakeMatchDetailWith,
  aFakeSeriesDetailResponseWith,
  aFakeSeriesPlayerWith,
  aFakeSeriesTeamWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { aFakeMedalWith, aFakeStatWith } from "@guilty-spark/shared/contracts/stats/fakes/detail-primitives.fake";
import { StatsDetailController } from "../../../../controllers/stats/stats-detail-controller";
import { projectSeriesTicker } from "../series-ticker-projection";

describe("projectSeriesTicker", () => {
  it("uses stable team and player IDs, contract totals and ordering, and per-row rarity signals", () => {
    const switcher = aFakeSeriesPlayerWith({
      playerId: "switch",
      gamertag: "Same",
      teamStats: [
        {
          seriesTeamId: 7,
          gamesPlayed: 3,
          stats: [aFakeStatWith({ value: 7 })],
          medals: [aFakeMedalWith({ name: "Other side", sortingWeight: 30 })],
        },
        {
          seriesTeamId: 42,
          gamesPlayed: 1,
          stats: [aFakeStatWith({ value: 42 })],
          medals: [
            aFakeMedalWith({ name: "Metadata", sortingWeight: 120, totalPersonalScoreAwarded: 999 }),
            aFakeMedalWith({ name: "Missing", sortingWeight: null }),
          ],
        },
      ],
    });
    const sameName = aFakeSeriesPlayerWith({
      playerId: "second",
      gamertag: "Same",
      teamStats: [
        {
          seriesTeamId: 42,
          gamesPlayed: 1,
          stats: [aFakeStatWith({ value: 20 })],
          medals: [aFakeMedalWith({ id: 8, name: null, sortingWeight: null, totalPersonalScoreAwarded: 0 })],
        },
      ],
    });
    const bot = aFakeSeriesPlayerWith({
      playerId: "bot",
      playerType: 2,
      gamertag: "not a human",
      teamStats: [{ seriesTeamId: 42, gamesPlayed: 3, stats: [], medals: [] }],
    });
    const response = aFakeSeriesDetailResponseWith({
      aggregation: {
        status: "resolved",
        gamesPlayed: 3,
        completedGameCount: 3,
        teams: [
          aFakeSeriesTeamWith({
            seriesTeamId: 42,
            playerIds: ["bot", "switch", "second", "missing"],
            stats: [aFakeStatWith({ value: 60 })],
            medals: [
              aFakeMedalWith({ name: "Contract team", sortingWeight: 150, count: 8 }),
              aFakeMedalWith({ id: 9, name: null, sortingWeight: null }),
            ],
          }),
          aFakeSeriesTeamWith({
            seriesTeamId: 7,
            playerIds: ["switch"],
            stats: [aFakeStatWith({ value: 70 })],
            medals: [aFakeMedalWith({ name: "Second team", sortingWeight: null, totalPersonalScoreAwarded: 25 })],
          }),
        ],
        players: [sameName, switcher, bot],
      },
    });
    const original = JSON.stringify(response);
    const result = projectSeriesTicker(response.aggregation, new StatsDetailController("en-US"));
    if (result.status !== "resolved") {
      throw new Error("expected resolved series");
    }

    expect(result.hasUnknownRarity).toBe(true);
    expect(result.teamData.map((team) => [team.teamId, team.hasUnknownRarity, team.teamMedals])).toEqual([
      [42, true, [{ name: "Contract team", count: 8, sortingWeight: 150 }]],
      [7, false, [{ name: "Second team", count: 2, sortingWeight: 25 }]],
    ]);
    expect(result.teamData.map((team) => team.teamStats[0])).toEqual([
      expect.objectContaining({ value: 60, display: "60", bestInMatch: false }),
      expect.objectContaining({ value: 70, display: "70", bestInMatch: true }),
    ]);
    expect(
      result.playerData.map((team) =>
        team.players.map(({ playerId, name, gamertag }) => ({
          playerId,
          name,
          gamertag,
        })),
      ),
    ).toEqual([
      [
        { playerId: "bot", name: "Bot", gamertag: null },
        { playerId: "switch", name: "Same (1/3 games)", gamertag: "Same" },
        { playerId: "second", name: "Same (1/3 games)", gamertag: "Same" },
      ],
      [{ playerId: "switch", name: "Same", gamertag: "Same" }],
    ]);
    const [, switched, second] = result.playerData[0].players;
    expect(switched.values[0]).toMatchObject({ value: 42, display: "42", bestInTeam: true, bestInMatch: true });
    expect(switched.medals).toEqual([{ name: "Metadata", count: 2, sortingWeight: 120 }]);
    expect(switched.hasUnknownRarity).toBe(true);
    expect(second.medals).toEqual([{ name: "8", count: 2, sortingWeight: 0 }]);
    expect(second.hasUnknownRarity).toBe(false);
    expect(result.playerData[1].players[0]).toMatchObject({
      playerId: "switch",
      values: [expect.objectContaining({ value: 7, bestInMatch: false })],
      medals: [{ name: "Other side", count: 2, sortingWeight: 30 }],
      hasUnknownRarity: false,
    });
    expect(result.teamData[0].players.map((player) => player.values)).toEqual([[], [], []]);
    expect(JSON.stringify(response)).toBe(original);
  });

  it("signals an unknown team medal even when the team has no players", () => {
    const medal = aFakeMedalWith({ sortingWeight: null });
    expect(medal).not.toHaveProperty("totalPersonalScoreAwarded");
    const result = projectSeriesTicker(
      {
        status: "resolved",
        gamesPlayed: 1,
        completedGameCount: 1,
        teams: [
          aFakeSeriesTeamWith({
            playerIds: [],
            medals: [medal],
          }),
        ],
        players: [],
      },
      new StatsDetailController(),
    );

    expect(result).toMatchObject({
      status: "resolved",
      hasUnknownRarity: true,
      teamData: [{ players: [], teamMedals: [], hasUnknownRarity: true }],
      playerData: [{ players: [], teamMedals: [], hasUnknownRarity: true }],
    });
  });

  it.each<Extract<SeriesAggregation, { status: "unavailable" }>["reason"]>([
    "incomplete-matches",
    "ambiguous-team-mapping",
    "aggregation-failed",
  ])("returns %s without replacing individually available matches", (reason) => {
    const match = aFakeMatchDetailWith({ matchId: "available" });
    const response = aFakeSeriesDetailResponseWith({
      matches: {
        matchIds: ["available", "unavailable"],
        results: [
          { status: "resolved", matchId: "available", detail: match },
          { status: "unavailable", matchId: "unavailable", reason: "fetch-failed" },
        ],
      },
      aggregation: { status: "unavailable", reason },
    });

    expect(projectSeriesTicker(response.aggregation, new StatsDetailController())).toEqual({
      status: "unavailable",
      reason,
    });
    expect(response.matches.results).toEqual([
      { status: "resolved", matchId: "available", detail: match },
      { status: "unavailable", matchId: "unavailable", reason: "fetch-failed" },
    ]);
  });

  it("returns empty resolved totals without inventing players or warnings", () => {
    expect(
      projectSeriesTicker(
        { status: "resolved", gamesPlayed: 0, completedGameCount: 0, teams: [], players: [] },
        new StatsDetailController(),
      ),
    ).toEqual({ status: "resolved", teamData: [], playerData: [], hasUnknownRarity: false });
  });
});
