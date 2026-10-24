import { describe, expect, it } from "vitest";
import { aFakeBipedPositionWith } from "../fakes/biped-position.fake";
import { dropIsolated, dropTeleports } from "../position-filters";

describe("dropIsolated", () => {
  it("drops a sample further than the isolation gap from every neighbour in its slot", () => {
    const kept = aFakeBipedPositionWith({ timestampMs: 1000 });
    const neighbour = aFakeBipedPositionWith({ timestampMs: 2000 });
    const isolated = aFakeBipedPositionWith({ timestampMs: 40_000 });

    expect(dropIsolated([isolated, neighbour, kept])).toEqual([kept, neighbour]);
  });

  it("judges each slot on its own samples", () => {
    const first = aFakeBipedPositionWith({ slot: 512, timestampMs: 1000 });
    const other = aFakeBipedPositionWith({ slot: 513, timestampMs: 1500 });

    expect(dropIsolated([first, other])).toEqual([]);
  });

  it("orders the kept samples by time then slot", () => {
    const positions = [
      aFakeBipedPositionWith({ slot: 513, timestampMs: 1000 }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 1000 }),
      aFakeBipedPositionWith({ slot: 513, timestampMs: 1100 }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 1100 }),
    ];

    expect(dropIsolated(positions).map((position) => [position.timestampMs, position.slot])).toEqual([
      [1000, 512],
      [1000, 513],
      [1100, 512],
      [1100, 513],
    ]);
  });
});

describe("dropTeleports", () => {
  it("drops a sample that moves faster than the axis speed limit and keeps the continuation", () => {
    const anchor = aFakeBipedPositionWith({ timestampMs: 1000, q: [1000, 1000, 1000] });
    const teleport = aFakeBipedPositionWith({ timestampMs: 1100, q: [5000, 1000, 1000] });
    const continuation = aFakeBipedPositionWith({ timestampMs: 1200, q: [1010, 1000, 1000] });

    expect(dropTeleports([anchor, teleport, continuation])).toEqual([anchor, continuation]);
  });

  it("re-seats the anchor after three consecutive rejections", () => {
    const anchor = aFakeBipedPositionWith({ timestampMs: 1000, q: [1000, 1000, 1000] });
    const jumped = [1100, 1200, 1300, 1400].map((timestampMs) =>
      aFakeBipedPositionWith({ timestampMs, q: [9000, 1000, 1000] }),
    );

    expect(dropTeleports([anchor, ...jumped])).toEqual([anchor, jumped[3]]);
  });

  it("treats a different position at the same instant as a teleport", () => {
    const anchor = aFakeBipedPositionWith({ timestampMs: 1000, q: [1000, 1000, 1000] });
    const duplicate = aFakeBipedPositionWith({ timestampMs: 1000, q: [1000, 1000, 1000] });
    const conflicting = aFakeBipedPositionWith({ timestampMs: 1000, q: [1001, 1000, 1000] });

    expect(dropTeleports([anchor, duplicate, conflicting])).toEqual([anchor, duplicate]);
  });

  it("keeps movement within the speed limit", () => {
    const positions = [0, 100, 200].map((offset) =>
      aFakeBipedPositionWith({ timestampMs: 1000 + offset, q: [1000 + offset * 10, 1000, 1000] }),
    );

    expect(dropTeleports(positions)).toEqual(positions);
  });
});
