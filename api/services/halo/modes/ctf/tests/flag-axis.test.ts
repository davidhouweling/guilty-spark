import { describe, expect, it } from "vitest";
import { FlagAxis, medianPosition } from "../flag-axis";

describe("FlagAxis", () => {
  const axis = new FlagAxis([1000, 1000, 1000], [11_000, 1000, 1000]);

  it("projects a position onto the stand-to-capture line as a unit interval", () => {
    expect(axis.progressOf([1000, 1000, 1000])).toBe(0);
    expect(axis.progressOf([6000, 4000, 1000])).toBe(0.5);
    expect(axis.progressOf([11_000, 1000, 1000])).toBe(1);
  });

  it("clamps positions behind the stand or beyond the capture point", () => {
    expect(axis.progressOf([0, 1000, 1000])).toBe(0);
    expect(axis.progressOf([20_000, 1000, 1000])).toBe(1);
  });

  it("is degenerate when the stand and capture point coincide", () => {
    const flat = new FlagAxis([1000, 1000, 1000], [1000, 1000, 1000]);

    expect(flat.isDegenerate).toBe(true);
    expect(flat.progressOf([5000, 1000, 1000])).toBe(0);
  });
});

describe("medianPosition", () => {
  it("takes the per-axis median so one stray reading cannot move the stand", () => {
    expect(
      medianPosition([
        [100, 10, 1],
        [102, 12, 1],
        [9000, 11, 1],
      ]),
    ).toEqual([102, 11, 1]);
  });

  it("returns null without positions", () => {
    expect(medianPosition([])).toBeNull();
  });
});
