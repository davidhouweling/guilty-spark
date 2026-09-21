import { describe, it, expect } from "vitest";
import type { MatchStats } from "halo-infinite-api";
import { aFakeCoreStatsWith, aFakeMatchStatsWith, aFakePlayerWith, aFakeTeamWith } from "../fakes/data";
import { aggregateTeamCoreStats } from "../series-team";

function aMatchWithTeams(
  overrides: {
    team0PlayerIds: string[];
    team1PlayerIds: string[];
    team0Score: number;
    team1Score: number;
  } & Partial<MatchStats>,
): MatchStats {
  const { team0PlayerIds, team1PlayerIds, team0Score, team1Score, ...matchOverrides } = overrides;

  const players = [
    ...team0PlayerIds.map((playerId) =>
      aFakePlayerWith({
        PlayerId: playerId,
        LastTeamId: 0,
        PlayerTeamStats: [
          {
            TeamId: 0,
            Stats: { CoreStats: aFakeCoreStatsWith(), PvpStats: { Kills: 0, Deaths: 0, Assists: 0, KDA: 0 } },
          },
        ],
      }),
    ),
    ...team1PlayerIds.map((playerId) =>
      aFakePlayerWith({
        PlayerId: playerId,
        LastTeamId: 1,
        PlayerTeamStats: [
          {
            TeamId: 1,
            Stats: { CoreStats: aFakeCoreStatsWith(), PvpStats: { Kills: 0, Deaths: 0, Assists: 0, KDA: 0 } },
          },
        ],
      }),
    ),
  ];

  return aFakeMatchStatsWith({
    Players: players,
    Teams: [
      aFakeTeamWith({
        TeamId: 0,
        Stats: {
          CoreStats: aFakeCoreStatsWith({ Score: team0Score }),
          PvpStats: { Kills: 0, Deaths: 0, Assists: 0, KDA: 0 },
        },
      }),
      aFakeTeamWith({
        TeamId: 1,
        Stats: {
          CoreStats: aFakeCoreStatsWith({ Score: team1Score }),
          PvpStats: { Kills: 0, Deaths: 0, Assists: 0, KDA: 0 },
        },
      }),
    ],
    ...matchOverrides,
  });
}

describe("aggregateTeamCoreStats", () => {
  it("sums each team's core stats across matches when the same team stays on the same side", () => {
    const matches = [
      aMatchWithTeams({ team0PlayerIds: ["p1", "p2"], team1PlayerIds: ["p3", "p4"], team0Score: 50, team1Score: 30 }),
      aMatchWithTeams({ team0PlayerIds: ["p1", "p2"], team1PlayerIds: ["p3", "p4"], team0Score: 60, team1Score: 20 }),
    ];

    const result = aggregateTeamCoreStats(matches);

    expect(result.get(0)?.Score).toBe(110);
    expect(result.get(1)?.Score).toBe(50);
  });

  it("attributes stats to the correct roster when a team swaps sides between matches", () => {
    const matches = [
      aMatchWithTeams({ team0PlayerIds: ["p1", "p2"], team1PlayerIds: ["p3", "p4"], team0Score: 50, team1Score: 30 }),
      // p1/p2 are now on match TeamId 1, and p3/p4 are on match TeamId 0 - a full side swap
      aMatchWithTeams({ team0PlayerIds: ["p3", "p4"], team1PlayerIds: ["p1", "p2"], team0Score: 20, team1Score: 60 }),
    ];

    const result = aggregateTeamCoreStats(matches);

    // Canonical team 0 (p1/p2, from the first match's TeamId 0) accumulates 50 + 60
    expect(result.get(0)?.Score).toBe(110);
    // Canonical team 1 (p3/p4) accumulates 30 + 20
    expect(result.get(1)?.Score).toBe(50);
  });
});
