import { describe, expect, it } from "vitest";
import { walkChunk } from "../../statborg/bit-reader";
import { aFakeReplicationChunkWith } from "../../statborg/fakes/replication-chunk.fake";
import { aFakeKeyframeChunkWith, buildKeyframePayload } from "../fakes/position-film.fake";
import { BIPED_ARCHETYPE, bipedSlotBand, walkKeyframeRecords } from "../keyframe-slots";

describe("walkKeyframeRecords", () => {
  it("lists every entity record with its slot, archetype and generation", () => {
    const payload = buildKeyframePayload([
      { slot: 512, archetype: BIPED_ARCHETYPE },
      { slot: 513, archetype: BIPED_ARCHETYPE, stateBits: 80 },
      { slot: 600, archetype: 7, generation: 2 },
    ]);

    expect(walkKeyframeRecords(payload)).toEqual([
      { slot: 512, archetype: BIPED_ARCHETYPE, generation: 1 },
      { slot: 513, archetype: BIPED_ARCHETYPE, generation: 1 },
      { slot: 600, archetype: 7, generation: 2 },
    ]);
  });

  it("walks records of one archetype by their learned width once two agree", () => {
    const payload = buildKeyframePayload([
      { slot: 10, archetype: 12 },
      { slot: 11, archetype: 12 },
      { slot: 12, archetype: 12 },
      { slot: 13, archetype: 12 },
    ]);

    expect(walkKeyframeRecords(payload).map((record) => record.slot)).toEqual([10, 11, 12, 13]);
  });

  it("returns no records for a keyframe that only carries the sentinel", () => {
    expect(walkKeyframeRecords(buildKeyframePayload([]))).toEqual([]);
  });

  it("returns no records for an empty payload", () => {
    expect(walkKeyframeRecords(new Uint8Array(0))).toEqual([]);
  });
});

describe("bipedSlotBand", () => {
  it("fills the band between the lowest and highest biped slot seen across chunks", () => {
    const chunks = [
      aFakeKeyframeChunkWith([
        { slot: 100, archetype: 3 },
        { slot: 512, archetype: BIPED_ARCHETYPE },
        { slot: 513, archetype: BIPED_ARCHETYPE },
      ]),
      aFakeKeyframeChunkWith([{ slot: 516, archetype: BIPED_ARCHETYPE }], { index: 2, startMs: 21_000 }),
    ];

    expect([...bipedSlotBand(chunks.map(walkChunk), 0)]).toEqual([512, 513, 514, 515, 516]);
  });

  it("adds a tail of spare slots above the highest seen for allocations after the final keyframe", () => {
    const chunks = [aFakeKeyframeChunkWith([{ slot: 512, archetype: BIPED_ARCHETYPE }])];

    expect([...bipedSlotBand(chunks.map(walkChunk), 3)]).toEqual([512, 513, 514, 515]);
  });

  it("ignores entities of other archetypes", () => {
    const chunks = [aFakeKeyframeChunkWith([{ slot: 100, archetype: 3 }])];

    expect(bipedSlotBand(chunks.map(walkChunk), 4).size).toBe(0);
  });

  it("returns an empty band when no chunk carries a keyframe", () => {
    expect(
      bipedSlotBand([walkChunk(aFakeReplicationChunkWith([{ timestampUs: 1_000_000n, records: [] }]))], 4).size,
    ).toBe(0);
  });
});
