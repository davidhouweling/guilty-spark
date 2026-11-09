import { describe, expect, it } from "vitest";
import type { MatchDetail } from "@guilty-spark/shared/contracts/stats/detail";
import { aFakeMatchDetailWith } from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import {
  aFakeMedalWith,
  aFakePlayerTeamStatsWith,
  aFakePlayerWith,
  aFakeStatWith,
  aFakeTeamWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail-primitives.fake";
import { StatsValueSortBy } from "@guilty-spark/shared/halo/stat-formatting";
import { MatchDetailStatsPresenter } from "../match-detail-stats-presenter";

type DetailStat = MatchDetail["teams"][number]["stats"][number];

describe("MatchDetailStatsPresenter", () => {
  it("keeps team and membership order, selects team entries by stable IDs and maps serialized medals", () => {
    const switchingPlayer = aFakePlayerWith({
      playerId: "switching",
      gamertag: "Switcher",
      lastMatchTeamId: 7,
      teamStats: [
        aFakePlayerTeamStatsWith({
          matchTeamId: 7,
          stats: [aFakeStatWith({ value: 7 })],
          medals: [aFakeMedalWith({ count: 7 })],
        }),
        aFakePlayerTeamStatsWith({
          matchTeamId: 42,
          seriesTeamId: 1,
          stats: [aFakeStatWith({ value: 42 })],
          medals: [aFakeMedalWith({ count: 42 })],
        }),
      ],
    });
    const detail = aFakeMatchDetailWith({
      teamCount: 2,
      teams: [
        aFakeTeamWith({
          matchTeamId: 42,
          seriesTeamId: 1,
          playerIds: ["bot", "switching", "unknown"],
          medals: [
            aFakeMedalWith({ id: 99, name: null, sortingWeight: null }),
            aFakeMedalWith({ name: "Low", sortingWeight: 10 }),
            aFakeMedalWith({ name: "High", sortingWeight: 100 }),
            aFakeMedalWith({ id: 98, name: null, sortingWeight: null }),
          ],
        }),
        aFakeTeamWith({ matchTeamId: 7, seriesTeamId: 0, playerIds: ["switching"], medals: [] }),
      ],
      players: [
        switchingPlayer,
        aFakePlayerWith({
          playerId: "unknown",
          gamertag: null,
          teamStats: [aFakePlayerTeamStatsWith({ matchTeamId: 42, medals: [] })],
        }),
        aFakePlayerWith({
          playerId: "bot",
          playerType: 2,
          gamertag: "Not a human",
          teamStats: [aFakePlayerTeamStatsWith({ matchTeamId: 42, medals: [] })],
        }),
      ],
    });
    const result = new MatchDetailStatsPresenter("en-US").present(detail);
    expect(result.map((team) => team.teamId)).toEqual([42, 7]);
    expect(result.map((team) => team.players.map((player) => player.name))).toEqual([
      ["Bot", "Switcher", "*Unknown*"],
      ["Switcher"],
    ]);
    expect(result[0].players[1].values[0].value).toBe(42);
    expect(result[1].players[0].values[0].value).toBe(7);
    expect(result[0].players[1].medals).toEqual([{ name: "Double Kill", count: 42, sortingWeight: 50 }]);
    expect(result[1].players[0].medals).toEqual([{ name: "Double Kill", count: 7, sortingWeight: 50 }]);
    expect(result[0].teamMedals).toEqual([
      { name: "High", count: 2, sortingWeight: 100 },
      { name: "Low", count: 2, sortingWeight: 10 },
      { name: "99", count: 2, sortingWeight: 0 },
      { name: "98", count: 2, sortingWeight: 0 },
    ]);
    expect(result[1].teamMedals).toEqual([]);
  });

  it("compares stable keys independently of labels, preserves ties and excludes non-comparable values", () => {
    const statsFor = (kills: number, deaths: number, ignored: number): DetailStat[] => [
      aFakeStatWith({ key: "kills", name: "Same label", value: kills }),
      aFakeStatWith({ key: "deaths", name: "Same label", value: deaths, sortBy: StatsValueSortBy.ASC }),
      aFakeStatWith({ key: "ignored", value: ignored, isComparable: false }),
    ];
    const detail = aFakeMatchDetailWith({
      teamCount: 2,
      teams: [
        aFakeTeamWith({ playerIds: ["a", "b"], stats: statsFor(50, 10, 100) }),
        aFakeTeamWith({ matchTeamId: 42, playerIds: ["c"], stats: statsFor(50, 20, 200) }),
      ],
      players: [
        aFakePlayerWith({ playerId: "a", teamStats: [aFakePlayerTeamStatsWith({ stats: statsFor(10, 2, 1000) })] }),
        aFakePlayerWith({ playerId: "b", teamStats: [aFakePlayerTeamStatsWith({ stats: statsFor(10, 3, 2000) })] }),
        aFakePlayerWith({
          playerId: "c",
          teamStats: [aFakePlayerTeamStatsWith({ matchTeamId: 42, stats: statsFor(20, 2, 3000) })],
        }),
      ],
    });
    const result = new MatchDetailStatsPresenter().present(detail);
    expect(result[0].players[0].values.map(({ key }) => key)).toEqual(["kills", "deaths", "ignored"]);
    const flags = (values: (typeof result)[number]["teamStats"]): boolean[][] =>
      values.map(({ bestInTeam, bestInMatch }) => [bestInTeam, bestInMatch]);
    expect(result.map((team) => flags(team.teamStats))).toEqual([
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
    expect(result.map((team) => team.players.map((player) => flags(player.values)))).toEqual([
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

  it("compares unbounded ratios above finite ratios and never highlights unavailable values", () => {
    const unbounded: DetailStat = {
      key: "ratio",
      name: "Ratio",
      format: "ratio",
      status: "unbounded",
      numerator: 10,
      denominator: 0,
      sortBy: StatsValueSortBy.DESC,
      isComparable: true,
    };
    const unavailable: DetailStat = { ...unbounded, status: "unavailable" };
    const nonComparable: DetailStat = { ...unbounded, isComparable: false };
    const finite = aFakeStatWith({ key: "ratio", format: "ratio", value: 999 });
    const detail = aFakeMatchDetailWith({
      teams: [aFakeTeamWith({ playerIds: ["a", "b", "c", "d", "e"] })],
      players: [unbounded, unbounded, finite, unavailable, nonComparable].map((stat, index) =>
        aFakePlayerWith({
          playerId: ["a", "b", "c", "d", "e"][index],
          teamStats: [aFakePlayerTeamStatsWith({ stats: [stat] })],
        }),
      ),
    });
    const [team] = new MatchDetailStatsPresenter().present(detail);
    expect(team.players.map((player) => [player.values[0].bestInTeam, player.values[0].bestInMatch])).toEqual([
      [true, true],
      [true, true],
      [false, false],
      [false, false],
      [false, false],
    ]);
    const [finiteTeam] = new MatchDetailStatsPresenter().present({
      ...detail,
      players: detail.players.slice(2),
    });
    expect(finiteTeam.players.map((player) => [player.values[0].bestInTeam, player.values[0].bestInMatch])).toEqual([
      [true, true],
      [false, false],
      [false, false],
    ]);
  });

  it("omits missing players and missing team entries and preserves empty team rows", () => {
    const detail = aFakeMatchDetailWith({
      teams: [aFakeTeamWith({ playerIds: ["missing", "xuid(1234567890)"], stats: [], medals: [] })],
      players: [aFakePlayerWith({ teamStats: [aFakePlayerTeamStatsWith({ matchTeamId: 42 })] })],
    });
    expect(new MatchDetailStatsPresenter().present(detail)).toEqual([
      { teamId: 7, teamStats: [], teamMedals: [], players: [] },
    ]);
    expect(new MatchDetailStatsPresenter().present(aFakeMatchDetailWith({ teams: [], teamCount: 0 }))).toEqual([]);
  });
});
