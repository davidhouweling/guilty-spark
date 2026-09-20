import { describe, it, expect } from "vitest";
import type { MatchTeamRoster, SeriesTeamRoster } from "../series-team-identity";
import { resolveSeriesTeamMapping } from "../series-team-identity";

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

  it("tolerates a single-player substitution while keeping the same side mapping", () => {
    const expectedRosters = [
      aSeriesTeamRoster({ seriesTeamId: 0, xuids: new Set(["a1", "a2"]) }),
      aSeriesTeamRoster({ seriesTeamId: 1, xuids: new Set(["b1", "b2"]) }),
    ];
    const matchRosters = [
      aMatchTeamRoster({ matchTeamId: 0, xuids: new Set(["a1", "a3"]) }),
      aMatchTeamRoster({ matchTeamId: 1, xuids: new Set(["b1", "b2"]) }),
    ];

    expect(resolveSeriesTeamMapping(expectedRosters, matchRosters)).toEqual([
      { seriesTeamId: 0, matchTeamId: 0, addedXuids: ["a3"], removedXuids: ["a2"] },
      { seriesTeamId: 1, matchTeamId: 1, addedXuids: [], removedXuids: [] },
    ]);
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

  it("resolves a swap combined with a substitution in the same transition", () => {
    const expectedRosters = [
      aSeriesTeamRoster({ seriesTeamId: 0, xuids: new Set(["a1", "a2"]) }),
      aSeriesTeamRoster({ seriesTeamId: 1, xuids: new Set(["b1", "b2"]) }),
    ];
    const matchRosters = [
      // Now team 0 slot holds series team 1's roster, but with a substitution (b2 -> b3)
      aMatchTeamRoster({ matchTeamId: 0, xuids: new Set(["b1", "b3"]) }),
      aMatchTeamRoster({ matchTeamId: 1, xuids: new Set(["a1", "a2"]) }),
    ];

    expect(resolveSeriesTeamMapping(expectedRosters, matchRosters)).toEqual([
      { seriesTeamId: 0, matchTeamId: 1, addedXuids: [], removedXuids: [] },
      { seriesTeamId: 1, matchTeamId: 0, addedXuids: ["b3"], removedXuids: ["b2"] },
    ]);
  });

  it("stays on the same side when the identity pairing is within tolerance, even with substitutions on both teams", () => {
    const expectedRosters = [
      aSeriesTeamRoster({ seriesTeamId: 0, xuids: new Set(["a1", "a2"]) }),
      aSeriesTeamRoster({ seriesTeamId: 1, xuids: new Set(["b1", "b2"]) }),
    ];
    const matchRosters = [
      aMatchTeamRoster({ matchTeamId: 0, xuids: new Set(["a1", "a3"]) }),
      aMatchTeamRoster({ matchTeamId: 1, xuids: new Set(["b1", "b3"]) }),
    ];

    expect(resolveSeriesTeamMapping(expectedRosters, matchRosters)).toEqual([
      { seriesTeamId: 0, matchTeamId: 0, addedXuids: ["a3"], removedXuids: ["a2"] },
      { seriesTeamId: 1, matchTeamId: 1, addedXuids: ["b3"], removedXuids: ["b2"] },
    ]);
  });

  it("prefers the identity pairing over swapping when both pairings have equal mismatch counts", () => {
    const expectedRosters = [
      aSeriesTeamRoster({ seriesTeamId: 0, xuids: new Set(["a1", "a2"]) }),
      aSeriesTeamRoster({ seriesTeamId: 1, xuids: new Set(["b1", "b2"]) }),
    ];
    const matchRosters = [
      aMatchTeamRoster({ matchTeamId: 0, xuids: new Set(["a1", "b1"]) }),
      aMatchTeamRoster({ matchTeamId: 1, xuids: new Set(["a2", "b2"]) }),
    ];

    expect(resolveSeriesTeamMapping(expectedRosters, matchRosters)).toEqual([
      { seriesTeamId: 0, matchTeamId: 0, addedXuids: ["b1"], removedXuids: ["a2"] },
      { seriesTeamId: 1, matchTeamId: 1, addedXuids: ["a2"], removedXuids: ["b1"] },
    ]);
  });

  it("rejects the match when a team's roster mismatch exceeds the tolerated amount", () => {
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

  it("respects a custom tolerance option", () => {
    const expectedRosters = [
      aSeriesTeamRoster({ seriesTeamId: 0, xuids: new Set(["a1", "a2", "a3"]) }),
      aSeriesTeamRoster({ seriesTeamId: 1, xuids: new Set(["b1", "b2", "b3"]) }),
    ];
    const matchRosters = [
      aMatchTeamRoster({ matchTeamId: 0, xuids: new Set(["a1", "c1", "c2"]) }),
      aMatchTeamRoster({ matchTeamId: 1, xuids: new Set(["b1", "b2", "b3"]) }),
    ];

    expect(
      resolveSeriesTeamMapping(expectedRosters, matchRosters, { maxToleratedMismatchesPerTeam: 2 }),
    ).toEqual([
      { seriesTeamId: 0, matchTeamId: 0, addedXuids: ["c1", "c2"], removedXuids: ["a2", "a3"] },
      { seriesTeamId: 1, matchTeamId: 1, addedXuids: [], removedXuids: [] },
    ]);
  });

  it("returns null when the number of teams is not exactly two on either side", () => {
    expect(resolveSeriesTeamMapping([aSeriesTeamRoster()], [aMatchTeamRoster(), aMatchTeamRoster()])).toBeNull();
    expect(resolveSeriesTeamMapping([aSeriesTeamRoster(), aSeriesTeamRoster()], [aMatchTeamRoster()])).toBeNull();
  });
});
