import { describe, expect, it } from "vitest";
import { aFakeMatchDetailWith } from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import {
  aFakeMedalWith,
  aFakePlayerTeamStatsWith,
  aFakePlayerWith,
  aFakeTeamWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail-primitives.fake";
import { getTeamPlayersFromMatches } from "@guilty-spark/shared/halo/match-stats";
import { serializeMedalDetails } from "@guilty-spark/shared/halo/medal-detail-serialization";
import { createMatchStatsFormatter } from "../create";
import { aFakeMatchStatsWith } from "../fakes/data";
import { projectStandaloneMatchMedals } from "../standalone-match-medals";

describe("projectStandaloneMatchMedals", () => {
  it("matches the raw ticker's player and team medals when metadata is missing", () => {
    const raw = aFakeMatchStatsWith();
    const [team] = raw.Teams;
    const players = getTeamPlayersFromMatches([raw], team);
    const detail = aFakeMatchDetailWith({
      teams: [aFakeTeamWith({ matchTeamId: team.TeamId, playerIds: players.map((player) => player.PlayerId) })],
      players: players.map((player) =>
        aFakePlayerWith({
          playerId: player.PlayerId,
          teamStats: player.PlayerTeamStats.map((stats) =>
            aFakePlayerTeamStatsWith({
              matchTeamId: stats.TeamId,
              medals: serializeMedalDetails(stats.Stats.CoreStats.Medals, {}, []),
            }),
          ),
        }),
      ),
    });
    const rawTeam = createMatchStatsFormatter(raw.MatchInfo.GameVariantCategory)
      .getData(raw, new Map(), {})
      .find((entry) => entry.teamId === team.TeamId);
    const [projectedTeam] = projectStandaloneMatchMedals(detail).teams;

    expect(projectedTeam.teamMedals).toEqual(rawTeam?.teamMedals);
    expect(projectedTeam.players.map((player) => player.medals)).toEqual(
      rawTeam?.players.map((player) => player.medals),
    );
  });

  it("uses metadata before fallback scores and aggregates in legacy player order", () => {
    const first = aFakePlayerWith({
      playerId: "first",
      teamStats: [
        aFakePlayerTeamStatsWith({
          medals: [
            aFakeMedalWith({ id: 17, name: null, sortingWeight: null, totalPersonalScoreAwarded: 50, count: 2 }),
            aFakeMedalWith({ id: 18, name: null, sortingWeight: null, totalPersonalScoreAwarded: 0, count: 1 }),
            aFakeMedalWith({ name: "Known", sortingWeight: 100, totalPersonalScoreAwarded: 999, count: 1 }),
          ],
        }),
      ],
    });
    const second = aFakePlayerWith({
      playerId: "second",
      teamStats: [
        aFakePlayerTeamStatsWith({
          medals: [
            aFakeMedalWith({ id: 17, name: null, sortingWeight: null, totalPersonalScoreAwarded: 200, count: 3 }),
            aFakeMedalWith({ name: "Known", sortingWeight: 100, count: 2 }),
          ],
        }),
      ],
    });
    const detail = aFakeMatchDetailWith({
      teams: [aFakeTeamWith({ playerIds: ["first", "second"], medals: [aFakeMedalWith({ name: "Ignored team" })] })],
      players: [second, first],
    });

    expect(projectStandaloneMatchMedals(detail)).toEqual({
      teams: [
        {
          teamId: 7,
          players: [
            {
              playerId: "first",
              medals: [
                { name: "Known", count: 1, sortingWeight: 100 },
                { name: "17", count: 2, sortingWeight: 50 },
                { name: "18", count: 1, sortingWeight: 0 },
              ],
              hasUnknownRarity: false,
            },
            {
              playerId: "second",
              medals: [
                { name: "17", count: 3, sortingWeight: 200 },
                { name: "Known", count: 2, sortingWeight: 100 },
              ],
              hasUnknownRarity: false,
            },
          ],
          teamMedals: [
            { name: "Known", count: 3, sortingWeight: 100 },
            { name: "17", count: 5, sortingWeight: 50 },
            { name: "18", count: 1, sortingWeight: 0 },
          ],
          hasUnknownRarity: false,
        },
      ],
      hasUnknownRarity: false,
    });
  });

  it("omits unknown rarity from old responses and marks the affected player, team, and match", () => {
    const detail = aFakeMatchDetailWith({
      teams: [aFakeTeamWith({ playerIds: ["one", "two"] })],
      players: [
        aFakePlayerWith({
          playerId: "one",
          teamStats: [
            aFakePlayerTeamStatsWith({
              medals: [
                aFakeMedalWith({ id: 18, name: null, sortingWeight: null }),
                aFakeMedalWith({ id: 19, name: "Known", sortingWeight: null }),
                aFakeMedalWith({ id: 19, name: "Known", sortingWeight: 100 }),
              ],
            }),
          ],
        }),
        aFakePlayerWith({
          playerId: "two",
          teamStats: [
            aFakePlayerTeamStatsWith({
              medals: [aFakeMedalWith({ id: 20, sortingWeight: 0, totalPersonalScoreAwarded: 200 })],
            }),
          ],
        }),
      ],
    });

    const result = projectStandaloneMatchMedals(detail);
    expect(result.hasUnknownRarity).toBe(true);
    expect(result.teams[0]).toEqual({
      teamId: 7,
      players: [
        {
          playerId: "one",
          medals: [{ name: "Known", count: 2, sortingWeight: 100 }],
          hasUnknownRarity: true,
        },
        {
          playerId: "two",
          medals: [{ name: "Double Kill", count: 2, sortingWeight: 0 }],
          hasUnknownRarity: false,
        },
      ],
      teamMedals: [
        { name: "Known", count: 2, sortingWeight: 100 },
        { name: "Double Kill", count: 2, sortingWeight: 0 },
      ],
      hasUnknownRarity: true,
    });
  });

  it("uses eligible players' matching team entries and ignores nonparticipants", () => {
    const player = aFakePlayerWith({
      playerId: "switcher",
      teamStats: [
        aFakePlayerTeamStatsWith({ matchTeamId: 7, medals: [aFakeMedalWith({ name: "Eagle", count: 1 })] }),
        aFakePlayerTeamStatsWith({ matchTeamId: 42, medals: [aFakeMedalWith({ name: "Cobra", count: 2 })] }),
      ],
    });
    const nonparticipant = aFakePlayerWith({
      playerId: "late",
      participation: { ...player.participation, presentAtBeginning: false },
      teamStats: [aFakePlayerTeamStatsWith({ medals: [aFakeMedalWith({ sortingWeight: null })] })],
    });
    const detail = aFakeMatchDetailWith({
      teamCount: 2,
      teams: [
        aFakeTeamWith({ playerIds: ["late", "missing", "switcher"] }),
        aFakeTeamWith({ matchTeamId: 42, playerIds: ["switcher"] }),
      ],
      players: [nonparticipant, player],
    });

    const result = projectStandaloneMatchMedals(detail);
    expect(result.hasUnknownRarity).toBe(false);
    expect(result.teams.map((team) => ({ id: team.teamId, players: team.players, medals: team.teamMedals }))).toEqual([
      {
        id: 7,
        players: [
          { playerId: "switcher", medals: [{ name: "Eagle", count: 1, sortingWeight: 50 }], hasUnknownRarity: false },
        ],
        medals: [{ name: "Eagle", count: 1, sortingWeight: 50 }],
      },
      {
        id: 42,
        players: [
          { playerId: "switcher", medals: [{ name: "Cobra", count: 2, sortingWeight: 50 }], hasUnknownRarity: false },
        ],
        medals: [{ name: "Cobra", count: 2, sortingWeight: 50 }],
      },
    ]);
  });
});
