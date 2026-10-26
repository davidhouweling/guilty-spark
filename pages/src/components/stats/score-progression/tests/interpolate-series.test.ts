import { describe, expect, it } from "vitest";
import { interpolateSeriesAt, stepSeriesAt } from "../interpolate-series";

const points = [
  { timestampMs: 0, value: 0 },
  { timestampMs: 100, value: 50 },
  { timestampMs: 100, value: 60 },
  { timestampMs: 300, value: 100 },
];
const valueOf = (point: { value: number }): number => point.value;

describe("stepSeriesAt", () => {
  it("holds the last value at or before the instant, the later of two at a repeated timestamp", () => {
    expect(stepSeriesAt(points, 50, valueOf)).toBe(0);
    expect(stepSeriesAt(points, 100, valueOf)).toBe(60);
    expect(stepSeriesAt(points, 299, valueOf)).toBe(60);
  });

  it("carries the last value forward past the series end", () => {
    expect(stepSeriesAt(points, 1000, valueOf)).toBe(100);
  });

  it("returns null before the first point and for an empty series", () => {
    expect(stepSeriesAt(points, -1, valueOf)).toBeNull();
    expect(stepSeriesAt([], 0, valueOf)).toBeNull();
  });
});

describe("interpolateSeriesAt", () => {
  it("interpolates linearly between neighbouring points", () => {
    expect(interpolateSeriesAt(points, 50, valueOf)).toBe(25);
    expect(interpolateSeriesAt(points, 200, valueOf)).toBe(80);
  });

  it("returns a point's own value on it, the first of two at a repeated timestamp", () => {
    expect(interpolateSeriesAt(points, 0, valueOf)).toBe(0);
    expect(interpolateSeriesAt(points, 100, valueOf)).toBe(50);
    expect(interpolateSeriesAt(points, 300, valueOf)).toBe(100);
  });

  it("returns null before the first point, after the last, and for an empty series", () => {
    expect(interpolateSeriesAt(points, -1, valueOf)).toBeNull();
    expect(interpolateSeriesAt(points, 301, valueOf)).toBeNull();
    expect(interpolateSeriesAt([], 0, valueOf)).toBeNull();
  });

  it("returns the first of two points sharing the series start", () => {
    const doubled = [
      { timestampMs: 0, value: 0 },
      { timestampMs: 0, value: 5 },
      { timestampMs: 300, value: 100 },
    ];
    expect(interpolateSeriesAt(doubled, 0, valueOf)).toBe(0);
  });

  it("returns the only point's value for a single-point series", () => {
    expect(interpolateSeriesAt([{ timestampMs: 5, value: 7 }], 5, valueOf)).toBe(7);
  });
});
