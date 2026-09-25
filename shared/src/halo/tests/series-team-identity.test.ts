import { describe, it, expect } from "vitest";
import { aFakeMatchStatsWith, aFakePlayerWith } from "../fakes/data";
import type { MatchTeamRoster, SeriesTeamRoster } from "../series-team-identity";
import { buildPresentAtBeginningTeamRosters, resolveSeriesTeamMapping } from "../series-team-identity";

function aSeriesTeamRoster(overrides: Partial<SeriesTeamRoster> = {}): SeriesTeamRoster {
  return {
    seriesTeamId: 0,
    xuids: new Set(["player-1", "player-2"]),
    ...overrides,
  };
}

function aMatchTeamRoster(overrides: Partial<MatchTeamRoster> = {}): MatchTeamRoster {
  return {
    matchTeamId: 0,
    xuids: new Set(["player-1", "player-2"]),
    ...overrides,
  };
}

describe("resolveSeriesTeamMapping", () => {
  it("maps matches teams to series teams by the same index when rosters are unchanged", () => {
    const expectedRosters = [
      aSeriesTeamRoster({ seriesTeamId: 0, xuids: new Set(["a1", "a2"]) }),
      aSeriesTeamRoster({ seriesTeamId: 1, xuids: new Set(["b1", "b2"]) }),
    ];
    const matchRosters = [
      aMatchTeamRoster({ matchTeamId: 0, xuids: new Set(["a1", "a2"]) }),
      aMatchTeamRoster({ matchTeamId: 1, xuids: new Set(["b1", "b2"]) }),
    ];

    expect(resolveSeriesTeamMapping(expectedRosters, matchRosters)).toEqual([
      { seriesTeamId: 0, matchTeamId: 0, addedXuids: [], removedXuids: [] },
      { seriesTeamId: 1, matchTeamId: 1, addedXuids: [], removedXuids: [] },
    ]);
  });

  it("rejects a substitution until its NeatQueue event updates the expected roster", () => {
    const expectedRosters = [
      aSeriesTeamRoster({ seriesTeamId: 0, xuids: new Set(["a1", "a2"]) }),
      aSeriesTeamRoster({ seriesTeamId: 1, xuids: new Set(["b1", "b2"]) }),
    ];
    const matchRosters = [
      aMatchTeamRoster({ matchTeamId: 0, xuids: new Set(["a1", "a3"]) }),
      aMatchTeamRoster({ matchTeamId: 1, xuids: new Set(["b1", "b2"]) }),
    ];

    expect(resolveSeriesTeamMapping(expectedRosters, matchRosters)).toBeNull();
  });

  it("maps a full side swap to the opposite match team index", () => {
    const expectedRosters = [
      aSeriesTeamRoster({ seriesTeamId: 0, xuids: new Set(["a1", "a2"]) }),
      aSeriesTeamRoster({ seriesTeamId: 1, xuids: new Set(["b1", "b2"]) }),
    ];
    const matchRosters = [
      aMatchTeamRoster({ matchTeamId: 0, xuids: new Set(["b1", "b2"]) }),
      aMatchTeamRoster({ matchTeamId: 1, xuids: new Set(["a1", "a2"]) }),
    ];

    expect(resolveSeriesTeamMapping(expectedRosters, matchRosters)).toEqual([
      { seriesTeamId: 0, matchTeamId: 1, addedXuids: [], removedXuids: [] },
      { seriesTeamId: 1, matchTeamId: 0, addedXuids: [], removedXuids: [] },
    ]);
  });

  it("rejects a side swap combined with an unrecorded substitution", () => {
    const expectedRosters = [
      aSeriesTeamRoster({ seriesTeamId: 0, xuids: new Set(["a1", "a2"]) }),
      aSeriesTeamRoster({ seriesTeamId: 1, xuids: new Set(["b1", "b2"]) }),
    ];
    const matchRosters = [
      // Now team 0 slot holds series team 1's roster, but with a substitution (b2 -> b3)
      aMatchTeamRoster({ matchTeamId: 0, xuids: new Set(["b1", "b3"]) }),
      aMatchTeamRoster({ matchTeamId: 1, xuids: new Set(["a1", "a2"]) }),
    ];

    expect(resolveSeriesTeamMapping(expectedRosters, matchRosters)).toBeNull();
  });

  it("matches an exact side swap after a substitution updates the expected roster", () => {
    const expectedRosters = [
      aSeriesTeamRoster({ seriesTeamId: 0, xuids: new Set(["a1", "a3"]) }),
      aSeriesTeamRoster({ seriesTeamId: 1, xuids: new Set(["b1", "b3"]) }),
    ];
    const matchRosters = [
      aMatchTeamRoster({ matchTeamId: 0, xuids: new Set(["b1", "b3"]) }),
      aMatchTeamRoster({ matchTeamId: 1, xuids: new Set(["a1", "a3"]) }),
    ];

    expect(resolveSeriesTeamMapping(expectedRosters, matchRosters)).toEqual([
      { seriesTeamId: 0, matchTeamId: 1, addedXuids: [], removedXuids: [] },
      { seriesTeamId: 1, matchTeamId: 0, addedXuids: [], removedXuids: [] },
    ]);
  });

  it("rejects the match when any team's roster differs", () => {
    const expectedRosters = [
      aSeriesTeamRoster({ seriesTeamId: 0, xuids: new Set(["a1", "a2", "a3"]) }),
      aSeriesTeamRoster({ seriesTeamId: 1, xuids: new Set(["b1", "b2", "b3"]) }),
    ];
    const matchRosters = [
      aMatchTeamRoster({ matchTeamId: 0, xuids: new Set(["a1", "c1", "c2"]) }),
      aMatchTeamRoster({ matchTeamId: 1, xuids: new Set(["b1", "b2", "b3"]) }),
    ];

    expect(resolveSeriesTeamMapping(expectedRosters, matchRosters)).toBeNull();
  });

  it("rejects entirely unrelated rosters on both sides", () => {
    const expectedRosters = [
      aSeriesTeamRoster({ seriesTeamId: 0, xuids: new Set(["a1", "a2"]) }),
      aSeriesTeamRoster({ seriesTeamId: 1, xuids: new Set(["b1", "b2"]) }),
    ];
    const matchRosters = [
      aMatchTeamRoster({ matchTeamId: 0, xuids: new Set(["c1", "c2"]) }),
      aMatchTeamRoster({ matchTeamId: 1, xuids: new Set(["d1", "d2"]) }),
    ];

    expect(resolveSeriesTeamMapping(expectedRosters, matchRosters)).toBeNull();
  });

  it("returns null when the number of teams is not exactly two on either side", () => {
    expect(resolveSeriesTeamMapping([aSeriesTeamRoster()], [aMatchTeamRoster(), aMatchTeamRoster()])).toBeNull();
    expect(resolveSeriesTeamMapping([aSeriesTeamRoster(), aSeriesTeamRoster()], [aMatchTeamRoster()])).toBeNull();
  });
});

describe("buildPresentAtBeginningTeamRosters", () => {
  it("orders rosters by TeamId rather than the order players appear in match stats", () => {
    const match = aFakeMatchStatsWith({
      Players: [
        aFakePlayerWith({ PlayerId: "xuid(team-1-player)", LastTeamId: 1 }),
        aFakePlayerWith({ PlayerId: "xuid(team-0-player)", LastTeamId: 0 }),
      ],
    });

    expect(buildPresentAtBeginningTeamRosters(match)?.map((roster) => roster.matchTeamId)).toEqual([0, 1]);
  });
});
