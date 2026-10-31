import { describe, expect, it } from "vitest";
import { walkChunk } from "../bit-reader";
import { scanFrameForStatRecords, scanWalkedChunkStatRecords, sortStatRecords } from "../stat-records";
import { aFakeReplicationChunkWith, buildFramePayload } from "../fakes/replication-chunk.fake";

describe("scanFrameForStatRecords", () => {
  it("decodes slot, component indices and both values of a record", () => {
    const payload = buildFramePayload([{ slot: 12, components: [{ index: 2, a: 7, b: 3 }] }]);
    const records = scanFrameForStatRecords(payload, 1234);
    expect(records).toHaveLength(1);
    expect(records[0]?.slot).toBe(12);
    expect(records[0]?.timestampMs).toBe(1234);
    expect(records[0]?.components.get(2)).toEqual({ a: 7, b: 3 });
  });

  it("decodes several components in one record and several records in one frame", () => {
    const payload = buildFramePayload([
      {
        slot: 6,
        components: [
          { index: 0, a: 200, b: 0 },
          { index: 1, a: 0, b: 8420 },
        ],
      },
      { slot: 24, components: [{ index: 22, a: 20, b: 1 }] },
    ]);
    const records = scanFrameForStatRecords(payload, 0);
    expect(records.map((record) => record.slot)).toEqual([6, 24]);
    expect(records[0]?.components.get(0)).toEqual({ a: 200, b: 0 });
    expect(records[0]?.components.get(1)).toEqual({ a: 0, b: 8420 });
    expect(records[1]?.components.get(22)).toEqual({ a: 20, b: 1 });
  });

  it("decodes negative and 32-bit wide values", () => {
    const payload = buildFramePayload([{ slot: 10, components: [{ index: 1, a: -115, b: 70_000 }] }]);
    expect(scanFrameForStatRecords(payload, 0)[0]?.components.get(1)).toEqual({ a: -115, b: 70_000 });
  });

  it("rejects a record when any channel is beyond the counter domain", () => {
    const payload = buildFramePayload([
      {
        slot: 10,
        components: [
          { index: 2, a: 1, b: 1 },
          { index: 22, a: 10, b: -2_000_000 },
        ],
      },
    ]);
    expect(scanFrameForStatRecords(payload, 0)).toEqual([]);
  });

  it("consumes flagged conditional values so the following component still decodes", () => {
    const payload = buildFramePayload([
      {
        slot: 10,
        components: [
          { index: 1, a: 0, b: 2075, conditionalA: 300, conditionalB: -5 },
          { index: 2, a: 17, b: 12 },
        ],
      },
    ]);
    const [record] = scanFrameForStatRecords(payload, 0);
    expect(record?.components.get(1)).toEqual({ a: 0, b: 2075 });
    expect(record?.components.get(2)).toEqual({ a: 17, b: 12 });
  });

  it("decodes consecutive records without re-matching inside a decoded record", () => {
    const payload = buildFramePayload([
      { slot: 10, components: [{ index: 2, a: 1, b: 1 }] },
      { slot: 12, components: [{ index: 2, a: 2, b: 2 }] },
    ]);
    expect(scanFrameForStatRecords(payload, 0).map((record) => record.slot)).toEqual([10, 12]);
  });

  it("rejects a record whose declared components do not all decode", () => {
    const payload = buildFramePayload([
      {
        slot: 10,
        components: [
          { index: 2, a: 1, b: 1 },
          { index: 3, a: 2, b: 2 },
        ],
      },
    ]);
    const truncated = payload.subarray(0, Math.ceil((1 + 14 + 2 + 1 + 3 + 12 + 10 + 10 + 10 + 2 + 4) / 8));
    expect(scanFrameForStatRecords(truncated, 0)).toEqual([]);
  });

  it("ignores records with odd or out-of-range slots", () => {
    const payload = buildFramePayload([
      { slot: 11, components: [{ index: 2, a: 1, b: 1 }] },
      { slot: 26, components: [{ index: 2, a: 1, b: 1 }] },
      { slot: 4, components: [{ index: 2, a: 1, b: 1 }] },
    ]);
    expect(scanFrameForStatRecords(payload, 0)).toEqual([]);
  });

  it("reads the round both component headers carry", () => {
    const payload = buildFramePayload([{ slot: 12, round: 1, components: [{ index: 2, a: 3, b: 1 }] }]);
    const [record] = scanFrameForStatRecords(payload, 0);
    expect(record?.round).toBe(1);
    expect(record?.components.get(2)).toEqual({ a: 3, b: 1 });
  });

  it("reads regulation records as round zero", () => {
    const payload = buildFramePayload([{ slot: 12, components: [{ index: 2, a: 3, b: 1 }] }]);
    expect(scanFrameForStatRecords(payload, 0)[0]?.round).toBe(0);
  });

  it("rejects a record whose two round headers disagree", () => {
    const payload = buildFramePayload([{ slot: 12, components: [{ index: 2, a: 3, b: 1, headers: [1, 0] }] }]);
    expect(scanFrameForStatRecords(payload, 0)).toEqual([]);
  });

  it("rejects a round beyond any observed format", () => {
    const payload = buildFramePayload([{ slot: 12, round: 8, components: [{ index: 2, a: 3, b: 1 }] }]);
    expect(scanFrameForStatRecords(payload, 0)).toEqual([]);
  });

  it("leaves the round headers of later components unconstrained", () => {
    const payload = buildFramePayload([
      {
        slot: 12,
        round: 1,
        components: [
          { index: 2, a: 3, b: 1 },
          { index: 3, a: 4, b: 0, headers: [3, 0] },
        ],
      },
    ]);
    const [record] = scanFrameForStatRecords(payload, 0);
    expect(record?.round).toBe(1);
    expect(record?.components.get(3)).toEqual({ a: 4, b: 0 });
  });

  it("decodes the dense component list form", () => {
    const components = Array.from({ length: 9 }, (_, index) => ({ index: index * 6, a: index, b: 100 + index }));
    const payload = buildFramePayload([{ slot: 6, round: 1, dense: true, components }]);
    const [record] = scanFrameForStatRecords(payload, 0);
    expect(record?.slot).toBe(6);
    expect(record?.round).toBe(1);
    expect([...(record?.components ?? [])]).toEqual(components.map(({ index, a, b }) => [index, { a, b }]));
  });

  it("maps dense components on both sides of the mask's 32-bit halves and at the top of the archetype", () => {
    const components = [
      { index: 57, a: 3, b: 0 },
      { index: 31, a: 1, b: 0 },
      { index: 32, a: 2, b: 0 },
    ];
    const payload = buildFramePayload([{ slot: 10, dense: true, components }]);
    expect([...(scanFrameForStatRecords(payload, 0)[0]?.components ?? [])]).toEqual([
      [31, { a: 1, b: 0 }],
      [32, { a: 2, b: 0 }],
      [57, { a: 3, b: 0 }],
    ]);
  });

  it("resumes after a dense record so the record that follows it still decodes", () => {
    const components = Array.from({ length: 8 }, (_, index) => ({ index: index * 3, a: index, b: 0 }));
    const payload = buildFramePayload(
      [
        { slot: 6, dense: true, components },
        { slot: 12, round: 1, components: [{ index: 2, a: 5, b: 4 }] },
      ],
      0,
    );
    const records = scanFrameForStatRecords(payload, 0);
    expect(records.map((record) => [record.slot, record.round, record.components.size])).toEqual([
      [6, 0, 8],
      [12, 1, 1],
    ]);
  });

  it("decodes records of different rounds back to back", () => {
    const payload = buildFramePayload(
      [
        { slot: 10, round: 1, components: [{ index: 2, a: 1, b: 0 }] },
        { slot: 12, components: [{ index: 2, a: 7, b: 3 }] },
      ],
      0,
    );
    expect(scanFrameForStatRecords(payload, 0).map((record) => [record.slot, record.round])).toEqual([
      [10, 1],
      [12, 0],
    ]);
  });

  it("rejects a dense list that names a component beyond the archetype", () => {
    const payload = buildFramePayload([{ slot: 6, dense: true, components: [{ index: 58, a: 1, b: 1 }] }]);
    expect(scanFrameForStatRecords(payload, 0)).toEqual([]);
  });

  it("rejects a dense record whose payload ends inside the mask", () => {
    const payload = buildFramePayload([{ slot: 6, dense: true, components: [{ index: 2, a: 1, b: 1 }] }]);
    expect(scanFrameForStatRecords(payload.subarray(0, 9), 0)).toEqual([]);
  });

  it("rejects a dense record whose round headers disagree", () => {
    const payload = buildFramePayload([
      { slot: 6, dense: true, components: [{ index: 2, a: 1, b: 1, headers: [1, 0] }] },
    ]);
    expect(scanFrameForStatRecords(payload, 0)).toEqual([]);
  });

  it("rejects a dense list with an empty mask", () => {
    const payload = buildFramePayload([{ slot: 6, dense: true, components: [] }]);
    expect(scanFrameForStatRecords(payload, 0)).toEqual([]);
  });

  it("returns nothing for an empty payload", () => {
    expect(scanFrameForStatRecords(new Uint8Array(0), 0)).toEqual([]);
    expect(scanFrameForStatRecords(new Uint8Array(32), 0)).toEqual([]);
  });
});

// A 199-byte FRAME payload captured from match 5e3900a6 (Empyrean, chunk 12): the team entity in
// slot 6 and the player in slot 10 both re-emit component 23 (flag returns / flag secures).
const REAL_EMPYREAN_FRAME_HEX =
  "a00342b80000006400a8570000000481ed0806910e2400115903fef6463d4fa09e37a788000058668889128008aab208108c86baa5a12aff5041000638606dfca68889d2000aac81d723879eae98631c5313ab0f8d3444568806410ab5a9e7504c9a222c48002ab20786ec813a9c2022e7cd490e3e44d1116a4001559039fe647fd4d903b3f2604d7dfc26897e10826ffffff2fe22395fe85aab03a18c271de6dda00de6dda00de6dda000673342d08c201bf44080efb48205bf500826fae020bba00083efcf80";

describe("scanFrameForStatRecords on a real film frame", () => {
  it("decodes the two component-23 records a real Empyrean frame carries", () => {
    const payload = Uint8Array.from(Buffer.from(REAL_EMPYREAN_FRAME_HEX, "hex"));
    const records = scanFrameForStatRecords(payload, 228_486);
    expect(records.map((record) => [record.slot, [...record.components]])).toEqual([
      [6, [[23, { a: 0, b: 3 }]]],
      [10, [[23, { a: 0, b: 1 }]]],
    ]);
  });
});

// 52 bytes of a real Empyrean frame at 6:10: the team-slot record the engine flushed in the
// dense list form, carrying eight components at once
const REAL_DENSE_RECORD_HEX =
  "800d400000000008061b8000011a0e0000b021000061076c5076c00100fd02a4032c0009101e4000444c0000000b018000008012";

describe("scanFrameForStatRecords on a real dense record", () => {
  it("maps each mask bit to its component in the order the engine writes them", () => {
    const payload = Uint8Array.from(Buffer.from(REAL_DENSE_RECORD_HEX, "hex"));
    const records = scanFrameForStatRecords(payload, 370_886);
    expect(records.map((record) => [record.slot, record.round, [...record.components]])).toEqual([
      [
        6,
        0,
        [
          [1, { a: 0, b: 6670 }],
          [2, { a: 44, b: 33 }],
          [3, { a: 24, b: 1900 }],
          [5, { a: 253, b: 10 }],
          [6, { a: 36, b: 484 }],
          [11, { a: 4400, b: 0 }],
          [12, { a: 44, b: 24 }],
          [21, { a: 2, b: 1 }],
        ],
      ],
    ]);
  });
});

describe("scanFrameForStatRecords back-to-back records", () => {
  it("accepts a record whose prefix starts exactly where the previous record ended", () => {
    const payload = buildFramePayload(
      [
        { slot: 10, components: [{ index: 2, a: 1, b: 1 }] },
        { slot: 12, components: [{ index: 2, a: 2, b: 2 }] },
      ],
      0,
    );
    expect(scanFrameForStatRecords(payload, 0).map((record) => record.slot)).toEqual([10, 12]);
  });
});

describe("scanWalkedChunkStatRecords", () => {
  it("dates records from the chunk start plus the frame offset from the first frame", () => {
    const chunk = aFakeReplicationChunkWith(
      [
        { timestampUs: 9_000_000n, records: [{ slot: 10, components: [{ index: 2, a: 1, b: 0 }] }] },
        { timestampUs: 9_250_000n, records: [{ slot: 10, components: [{ index: 2, a: 2, b: 0 }] }] },
      ],
      { startMs: 20_000 },
    );
    expect(scanWalkedChunkStatRecords(walkChunk(chunk)).map((record) => record.timestampMs)).toEqual([20_000, 20_250]);
  });

  it("merges chunks in timestamp order", () => {
    const later = aFakeReplicationChunkWith(
      [{ timestampUs: 1n, records: [{ slot: 10, components: [{ index: 2, a: 5, b: 0 }] }] }],
      {
        index: 2,
        startMs: 20_000,
      },
    );
    const earlier = aFakeReplicationChunkWith(
      [{ timestampUs: 1n, records: [{ slot: 12, components: [{ index: 2, a: 1, b: 0 }] }] }],
      {
        index: 1,
        startMs: 0,
      },
    );
    expect(
      sortStatRecords([
        ...scanWalkedChunkStatRecords(walkChunk(later)),
        ...scanWalkedChunkStatRecords(walkChunk(earlier)),
      ]).map((record) => [record.timestampMs, record.slot]),
    ).toEqual([
      [0, 12],
      [20_000, 10],
    ]);
  });

  it("dates frames from the earliest frame timestamp in the chunk and returns them in clock order", () => {
    const chunk = aFakeReplicationChunkWith(
      [
        { timestampUs: 9_250_000n, records: [{ slot: 10, components: [{ index: 2, a: 1, b: 0 }] }] },
        { timestampUs: 9_000_000n, records: [{ slot: 10, components: [{ index: 2, a: 2, b: 0 }] }] },
      ],
      { startMs: 20_000 },
    );
    expect(scanWalkedChunkStatRecords(walkChunk(chunk)).map((record) => record.timestampMs)).toEqual([20_000, 20_250]);
  });

  it("returns nothing for a chunk without frames", () => {
    expect(
      scanWalkedChunkStatRecords(walkChunk({ index: 1, startMs: 0, durationMs: 1, data: new Uint8Array(0) })),
    ).toEqual([]);
  });

  it("sorts without mutating the input", () => {
    const records = [
      ...scanWalkedChunkStatRecords(
        walkChunk(
          aFakeReplicationChunkWith([
            {
              timestampUs: 1n,
              records: [
                { slot: 12, components: [{ index: 2, a: 1, b: 0 }] },
                { slot: 10, components: [{ index: 2, a: 1, b: 0 }] },
              ],
            },
          ]),
        ),
      ),
    ];
    const sorted = sortStatRecords(records);
    expect(sorted.map((record) => record.slot)).toEqual([10, 12]);
    expect(records.map((record) => record.slot)).toEqual([12, 10]);
  });
});
