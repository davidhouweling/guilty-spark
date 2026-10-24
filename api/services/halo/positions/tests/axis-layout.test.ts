import { describe, expect, it } from "vitest";
import { walkChunk } from "../../statborg/bit-reader";
import { AxisLayoutError, detectAxisLayout, flipBoundaries, layoutFromBoundaries } from "../axis-layout";
import {
  aFakeBipedFrameChunkWith,
  aFakePositionFilmWith,
  FAKE_AXIS_LAYOUT,
  FAKE_ORIGIN,
  walkPosition,
} from "../fakes/position-film.fake";
import type { AxisLayout } from "../types";

describe("detectAxisLayout", () => {
  it("reads the axis widths off the bit flip profile of moving bipeds", () => {
    const chunks = aFakePositionFilmWith({
      lives: [
        { slot: 512, startMs: 1000, endMs: 6000 },
        { slot: 513, startMs: 1000, endMs: 6000 },
      ],
    });

    expect(detectAxisLayout(chunks.map(walkChunk), new Set([512, 513]))).toEqual({
      gateBits: 5,
      axisWidths: [15, 15, 17],
    });
  });

  it("recovers a different layout for a map with narrower axes", () => {
    const layout: AxisLayout = { gateBits: 5, axisWidths: [12, 12, 14] };
    const chunks = aFakePositionFilmWith({
      layout,
      lives: [{ slot: 512, startMs: 1000, endMs: 11_000, origin: [3000, 3000, 12_000] }],
    });

    expect(detectAxisLayout(chunks.map(walkChunk), new Set([512]))).toEqual(layout);
  });

  it("profiles only records in region zero so a toggling region bit cannot fake a boundary", () => {
    const frames = [...Array(80).keys()].map((step) => ({
      timestampUs: BigInt(1_000_000 + step * 100_000),
      records: [{ slot: 512, q: walkPosition(FAKE_ORIGIN, 512, step), gate: step % 2 }],
    }));

    expect(detectAxisLayout([walkChunk(aFakeBipedFrameChunkWith(frames))], new Set([512]))).toEqual(FAKE_AXIS_LAYOUT);
  });

  it("reads the layout from a later chunk when the opening chunks hold still", () => {
    const still = [...Array(20).keys()].map((step) => ({
      timestampUs: BigInt(1_000_000 + step * 100_000),
      records: [{ slot: 512, q: FAKE_ORIGIN }],
    }));
    const moving = aFakePositionFilmWith({
      lives: [{ slot: 512, startMs: 21_000, endMs: 26_000 }],
      firstChunkStartMs: 21_000,
      firstChunkIndex: 2,
    });

    expect(
      detectAxisLayout([walkChunk(aFakeBipedFrameChunkWith(still)), ...moving.map(walkChunk)], new Set([512])),
    ).toEqual(FAKE_AXIS_LAYOUT);
  });

  it("throws when the bipeds hold still and no field boundary shows", () => {
    const frames = [1_000_000n, 1_100_000n, 1_200_000n, 1_300_000n].map((timestampUs) => ({
      timestampUs,
      records: [{ slot: 512, q: [12_000, 12_000, 70_000] as const }],
    }));

    expect(() => detectAxisLayout([walkChunk(aFakeBipedFrameChunkWith(frames))], new Set([512]))).toThrow(
      AxisLayoutError,
    );
  });

  it("throws when no chunk carries biped records", () => {
    expect(() => detectAxisLayout([walkChunk(aFakeBipedFrameChunkWith([]))], new Set([512]))).toThrow(
      "0 record pairs, 0 samples",
    );
  });
});

describe("flipBoundaries", () => {
  it("marks a bit that stops flipping right after a bit that flipped often", () => {
    expect(flipBoundaries([0, 0, 0.3, 0.5, 0.01, 0.2, 0.5, 0.0])).toEqual([4, 7]);
  });

  it("ignores a drop that follows a bit flipping below saturation", () => {
    expect(flipBoundaries([0.05, 0, 0.09, 0])).toEqual([]);
  });
});

describe("layoutFromBoundaries", () => {
  it("builds the layout from three boundaries after the default gate", () => {
    expect(layoutFromBoundaries([20, 35, 52])).toEqual({ gateBits: 5, axisWidths: [15, 15, 17] });
  });

  it("returns null with fewer than three boundaries", () => {
    expect(layoutFromBoundaries([20, 35])).toBeNull();
  });

  it("returns null when a width falls outside the plausible range", () => {
    expect(layoutFromBoundaries([10, 35, 52])).toBeNull();
    expect(layoutFromBoundaries([20, 35, 70])).toBeNull();
  });
});
