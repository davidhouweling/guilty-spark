import { describe, expect, it } from "vitest";
import type { SeriesAggregation, SeriesPlayer } from "@guilty-spark/shared/contracts/stats/detail";
import type { Stat } from "@guilty-spark/shared/contracts/stats/detail-primitives";
import { aFakeSeriesPlayerWith, aFakeSeriesTeamWith } from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { aFakeMedalWith, aFakeStatWith } from "@guilty-spark/shared/contracts/stats/fakes/detail-primitives.fake";
import { StatsValueSortBy } from "@guilty-spark/shared/halo/stat-formatting";
import { StatsDetailController } from "../stats-detail-controller";

type ResolvedAggregation = Extract<SeriesAggregation, { status: "resolved" }>;

function aggregationWith(overrides: Partial<ResolvedAggregation> = {}): ResolvedAggregation {
  return { status: "resolved", gamesPlayed: 3, completedGameCount: 1, teams: [], players: [], ...overrides };
}

function playerWith(playerId: string, seriesTeamId: number, stats: Stat[]): SeriesPlayer {
  return aFakeSeriesPlayerWith({
    playerId,
    teamStats: [{ seriesTeamId, gamesPlayed: 3, stats, medals: [] }],
  });
}

function flags(stats: { bestInTeam: boolean; bestInMatch: boolean }[]): boolean[][] {
  return stats.map(({ bestInTeam, bestInMatch }) => [bestInTeam, bestInMatch]);
}

describe("StatsDetailController series mapping", () => {
  it("maps stable team and player IDs, per-team totals, medals and missing-games names", () => {
    const switching = playerWith("switch", 7, [aFakeStatWith({ value: 7 })]);
    const result = new StatsDetailController("en-US").mapSeriesAggregationToStats(
      aggregationWith({
        teams: [
          aFakeSeriesTeamWith({
            seriesTeamId: 42,
            gamesPlayed: 2,
            playerIds: ["bot", "switch", "unknown", "missing", "wrong"],
            stats: [aFakeStatWith({ value: 1234.567, prefix: "+" })],
            medals: [
              aFakeMedalWith({ id: 99, name: null, sortingWeight: null }),
              aFakeMedalWith({ name: "High", count: 9, sortingWeight: 100 }),
            ],
          }),
          aFakeSeriesTeamWith({ seriesTeamId: 7, gamesPlayed: 3, playerIds: ["switch"], medals: [] }),
        ],
        players: [
          aFakeSeriesPlayerWith({
            ...switching,
            gamertag: "Switcher",
            gamesPlayed: 3,
            stats: [aFakeStatWith({ value: 999 })],
            medals: [aFakeMedalWith({ count: 999 })],
            teamStats: [
              ...switching.teamStats,
              {
                seriesTeamId: 42,
                gamesPlayed: 1,
                stats: [aFakeStatWith({ value: 42 })],
                medals: [aFakeMedalWith({ count: 42 })],
              },
            ],
          }),
          aFakeSeriesPlayerWith({ ...playerWith("unknown", 42, []), gamertag: null }),
          aFakeSeriesPlayerWith({ ...playerWith("bot", 42, []), playerType: 2, gamertag: "Not human" }),
          playerWith("wrong", 7, []),
        ],
      }),
    );
    expect(result.teamData.map((team) => team.teamId)).toEqual([42, 7]);
    expect(result.playerData.map((team) => team.teamId)).toEqual([42, 7]);
    expect(result.playerData.map((team) => team.players.map((player) => player.name))).toEqual([
      ["Bot", "Switcher (1/3 games)", "*Unknown*"],
      ["Switcher"],
    ]);
    expect(
      result.playerData.map((team) => team.players.map((player) => player.values.map((stat) => stat.value))),
    ).toEqual([[[], [42], []], [[7]]]);
    expect(result.teamData[0].teamStats[0]).toMatchObject({
      name: "Kills",
      value: 1234.567,
      display: "+1,234.57",
    });
    expect(result.teamData[1].teamStats[0].display).toBe("24");
    expect(result.teamData[0].teamMedals).toEqual([
      { name: "High", count: 9, sortingWeight: 100 },
      { name: "99", count: 2, sortingWeight: 0 },
    ]);
    expect(result.playerData[0].players[1].medals).toEqual([{ name: "Double Kill", count: 42, sortingWeight: 50 }]);
    expect(result.teamData[0].players).toEqual(
      result.playerData[0].players.map((player) => ({ ...player, values: [] })),
    );
    expect(result.playerData.map((team) => team.teamStats)).toEqual([[], []]);
    expect(result.playerData.map((team) => team.teamMedals)).toEqual(result.teamData.map((team) => team.teamMedals));
  });

  it("compares stable stat keys, ascending and descending values, ties and non-comparable values", () => {
    const stats = (kills: number, deaths: number): Stat[] => [
      aFakeStatWith({ key: "kills", name: "Same", value: kills }),
      aFakeStatWith({ key: "deaths", name: "Same", value: deaths, sortBy: StatsValueSortBy.ASC }),
      aFakeStatWith({ key: "ignored", value: kills, isComparable: false }),
    ];
    const result = new StatsDetailController().mapSeriesAggregationToStats(
      aggregationWith({
        teams: [
          aFakeSeriesTeamWith({ seriesTeamId: 42, playerIds: ["a", "b"], stats: stats(50, 10) }),
          aFakeSeriesTeamWith({ seriesTeamId: 7, playerIds: ["c"], stats: stats(50, 20) }),
        ],
        players: [
          playerWith("c", 7, stats(20, 2)),
          playerWith("b", 42, stats(10, 3)),
          playerWith("a", 42, stats(10, 2)),
        ],
      }),
    );
    expect(result.teamData.map((team) => flags(team.teamStats))).toEqual([
      [
        [false, true],
        [false, true],
        [false, false],
      ],
      [
        [false, true],
        [false, false],
        [false, false],
      ],
    ]);
    expect(result.playerData.map((team) => team.players.map((player) => flags(player.values)))).toEqual([
      [
        [
          [true, false],
          [true, true],
          [false, false],
        ],
        [
          [true, false],
          [false, false],
          [false, false],
        ],
      ],
      [
        [
          [true, true],
          [true, true],
          [false, false],
        ],
      ],
    ]);
  });

  it("formats unavailable and unbounded values and excludes unavailable and non-comparable values from bests", () => {
    const unbounded: Stat = {
      key: "ratio",
      name: "Ratio",
      format: "ratio",
      status: "unbounded",
      numerator: 10,
      denominator: 0,
      prefix: "+",
      sortBy: StatsValueSortBy.DESC,
      isComparable: true,
    };
    const unavailable: Stat = { ...unbounded, status: "unavailable" };
    const finite = aFakeStatWith({ key: "ratio", format: "ratio", value: 999 });
    const result = new StatsDetailController("en-US").mapSeriesAggregationToStats(
      aggregationWith({
        teams: [
          aFakeSeriesTeamWith({
            gamesPlayed: 3,
            playerIds: ["a", "b", "c", "d", "e"],
            stats: [unbounded, unavailable],
          }),
        ],
        players: [unbounded, unbounded, finite, unavailable, { ...unbounded, isComparable: false }].map((stat, index) =>
          playerWith(["a", "b", "c", "d", "e"][index], 0, [stat]),
        ),
      }),
    );
    expect(result.teamData[0].teamStats).toMatchObject([
      { value: Infinity, display: "+♾️", bestInTeam: false, bestInMatch: true },
      { value: NaN, display: "n/a", bestInTeam: false, bestInMatch: false },
    ]);
    expect(result.playerData[0].players.map((player) => flags(player.values))).toEqual([
      [[true, true]],
      [[true, true]],
      [[false, false]],
      [[false, false]],
      [[false, false]],
    ]);
    expect(result.playerData[0].players.map((player) => player.values[0].display)).toEqual([
      "+♾️",
      "+♾️",
      "999",
      "n/a",
      "+♾️",
    ]);
  });

  it("preserves empty teams and zero-game aggregations without inventing rows or suffixes", () => {
    expect(new StatsDetailController().mapSeriesAggregationToStats(aggregationWith())).toEqual({
      teamData: [],
      playerData: [],
    });
    const result = new StatsDetailController().mapSeriesAggregationToStats(
      aggregationWith({
        gamesPlayed: 0,
        completedGameCount: 0,
        teams: [aFakeSeriesTeamWith({ gamesPlayed: 0, playerIds: ["missing"], stats: [], medals: [] })],
      }),
    );
    const emptyTeam = { teamId: 0, teamStats: [], teamMedals: [], players: [] };
    expect(result).toEqual({ teamData: [emptyTeam], playerData: [emptyTeam] });
  });
});
