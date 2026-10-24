import { describe, expect, it } from "vitest";
import { aFakeBipedPositionWith } from "../fakes/biped-position.fake";
import { groupBySlot } from "../group-by-slot";

describe("groupBySlot", () => {
  it("groups samples by slot in slot order with each slot's samples in time order", () => {
    const positions = [
      aFakeBipedPositionWith({ slot: 513, timestampMs: 2000 }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 3000 }),
      aFakeBipedPositionWith({ slot: 513, timestampMs: 1000 }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 1000 }),
    ];

    const grouped = groupBySlot(positions);

    expect([...grouped.keys()]).toEqual([512, 513]);
    expect(grouped.get(512)?.map((position) => position.timestampMs)).toEqual([1000, 3000]);
    expect(grouped.get(513)?.map((position) => position.timestampMs)).toEqual([1000, 2000]);
  });

  it("returns an empty map without samples", () => {
    expect(groupBySlot([]).size).toBe(0);
  });
});
