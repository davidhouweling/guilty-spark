import { describe, expect, it } from "vitest";
import { aFakeBipedPositionWith } from "../fakes/biped-position.fake";
import { buildLives } from "../lives";

describe("buildLives", () => {
  it("opens a new life where a slot falls silent for longer than the life gap", () => {
    const positions = [
      aFakeBipedPositionWith({ slot: 512, timestampMs: 1000, q: [1, 2, 3] }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 2000, q: [4, 5, 6] }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 9000, q: [7, 8, 9] }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 9500, q: [10, 11, 12] }),
    ];

    expect(buildLives(positions)).toEqual([
      {
        slot: 512,
        startMs: 1000,
        endMs: 2000,
        xuid: null,
        samples: [
          { timestampMs: 1000, q: [1, 2, 3] },
          { timestampMs: 2000, q: [4, 5, 6] },
        ],
      },
      {
        slot: 512,
        startMs: 9000,
        endMs: 9500,
        xuid: null,
        samples: [
          { timestampMs: 9000, q: [7, 8, 9] },
          { timestampMs: 9500, q: [10, 11, 12] },
        ],
      },
    ]);
  });

  it("drops a life made of a single sample", () => {
    const positions = [
      aFakeBipedPositionWith({ slot: 512, timestampMs: 1000 }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 1100 }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 9000 }),
    ];

    expect(buildLives(positions).map((life) => [life.startMs, life.endMs])).toEqual([[1000, 1100]]);
  });

  it("keeps a short gap inside one life and orders lives by slot", () => {
    const positions = [
      aFakeBipedPositionWith({ slot: 513, timestampMs: 1000 }),
      aFakeBipedPositionWith({ slot: 513, timestampMs: 1100 }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 1000 }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 5000 }),
    ];

    expect(buildLives(positions).map((life) => [life.slot, life.startMs, life.endMs])).toEqual([
      [512, 1000, 5000],
      [513, 1000, 1100],
    ]);
  });

  it("returns no lives without positions", () => {
    expect(buildLives([])).toEqual([]);
  });
});
