import { describe, expect, it } from "vitest";
import { tileSegments } from "../timeline-segments";

const COLORS = new Map<number, string>([
  [0, "#0000ff"],
  [1, "#ff0000"],
]);

describe("tileSegments", () => {
  it("fills gaps before, between, and after occupied intervals with unoccupied segments", () => {
    const segments = tileSegments(
      0,
      100,
      [
        { startMs: 10, endMs: 20, teamId: 0 },
        { startMs: 40, endMs: 50, teamId: 1 },
      ],
      COLORS,
    );
    expect(segments).toEqual([
      { startMs: 0, endMs: 10, teamId: null, color: null },
      { startMs: 10, endMs: 20, teamId: 0, color: "#0000ff" },
      { startMs: 20, endMs: 40, teamId: null, color: null },
      { startMs: 40, endMs: 50, teamId: 1, color: "#ff0000" },
      { startMs: 50, endMs: 100, teamId: null, color: null },
    ]);
  });

  it("returns a single unoccupied segment when there are no occupied intervals", () => {
    expect(tileSegments(0, 100, [], COLORS)).toEqual([{ startMs: 0, endMs: 100, teamId: null, color: null }]);
  });

  it("sorts unordered occupied intervals before tiling", () => {
    const segments = tileSegments(
      0,
      100,
      [
        { startMs: 40, endMs: 50, teamId: 1 },
        { startMs: 10, endMs: 20, teamId: 0 },
      ],
      COLORS,
    );
    expect(segments.map((s) => s.teamId)).toEqual([null, 0, null, 1, null]);
  });

  it("merges adjacent same-team segments", () => {
    const segments = tileSegments(
      0,
      100,
      [
        { startMs: 10, endMs: 20, teamId: 0 },
        { startMs: 20, endMs: 30, teamId: 0 },
      ],
      COLORS,
    );
    expect(segments).toEqual([
      { startMs: 0, endMs: 10, teamId: null, color: null },
      { startMs: 10, endMs: 30, teamId: 0, color: "#0000ff" },
      { startMs: 30, endMs: 100, teamId: null, color: null },
    ]);
  });

  it("clamps an interval overrunning the row bounds on both sides", () => {
    const segments = tileSegments(10, 90, [{ startMs: 0, endMs: 100, teamId: 0 }], COLORS);
    expect(segments).toEqual([{ startMs: 10, endMs: 90, teamId: 0, color: "#0000ff" }]);
  });

  it("drops an interval entirely outside the row bounds", () => {
    const segments = tileSegments(0, 100, [{ startMs: 200, endMs: 300, teamId: 0 }], COLORS);
    expect(segments).toEqual([{ startMs: 0, endMs: 100, teamId: null, color: null }]);
  });

  it("clamps an interval contained in its predecessor to the untiled remainder", () => {
    const segments = tileSegments(
      0,
      100,
      [
        { startMs: 0, endMs: 60, teamId: 0 },
        { startMs: 10, endMs: 20, teamId: 1 },
      ],
      COLORS,
    );
    expect(segments).toEqual([
      { startMs: 0, endMs: 60, teamId: 0, color: "#0000ff" },
      { startMs: 60, endMs: 100, teamId: null, color: null },
    ]);
  });

  it("clamps a partially overlapping interval to start where the previous one ends", () => {
    const segments = tileSegments(
      0,
      100,
      [
        { startMs: 0, endMs: 50, teamId: 0 },
        { startMs: 40, endMs: 70, teamId: 1 },
      ],
      COLORS,
    );
    expect(segments).toEqual([
      { startMs: 0, endMs: 50, teamId: 0, color: "#0000ff" },
      { startMs: 50, endMs: 70, teamId: 1, color: "#ff0000" },
      { startMs: 70, endMs: 100, teamId: null, color: null },
    ]);
  });

  it("merges a null-team occupied interval with the surrounding gap fill", () => {
    const segments = tileSegments(0, 100, [{ startMs: 10, endMs: 20, teamId: null }], COLORS);
    expect(segments).toEqual([{ startMs: 0, endMs: 100, teamId: null, color: null }]);
  });

  it("uses a null color for a team missing from the color map", () => {
    const segments = tileSegments(0, 100, [{ startMs: 10, endMs: 20, teamId: 7 }], COLORS);
    expect(segments[1]).toEqual({ startMs: 10, endMs: 20, teamId: 7, color: null });
  });
});
