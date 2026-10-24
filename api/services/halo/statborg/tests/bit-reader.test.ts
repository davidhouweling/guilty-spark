import { describe, expect, it } from "vitest";
import {
  readBitsBE,
  MalformedPacketStreamError,
  PACKET_TYPE_CHUNK_END,
  PACKET_TYPE_FRAME,
  PACKET_TYPE_KEYFRAME,
  walkFramePackets,
  walkPackets,
} from "../bit-reader";
import { buildChunkBytes, buildReplicationChunkBytes } from "../fakes/replication-chunk.fake";

describe("readBitsBE", () => {
  it("reads big-endian bit fields across byte boundaries", () => {
    const data = Uint8Array.of(0b1010_1100, 0b0101_0011);
    expect(readBitsBE(data, 0, 4)).toBe(0b1010);
    expect(readBitsBE(data, 6, 6)).toBe(0b00_0101);
    expect(readBitsBE(data, 0, 16)).toBe(0b1010_1100_0101_0011);
  });

  it("reads 32-bit fields without sign wrap", () => {
    const data = Uint8Array.of(0xff, 0xff, 0xff, 0xff);
    expect(readBitsBE(data, 0, 32)).toBe(0xffff_ffff);
  });

  it("stops at the end of the data", () => {
    expect(readBitsBE(Uint8Array.of(0b1000_0000), 0, 12)).toBe(0b1000_0000);
  });
});

describe("walkPackets", () => {
  it("returns every packet with its type, including the keyframe and the CHUNK_END", () => {
    const bytes = buildChunkBytes([
      { type: PACKET_TYPE_KEYFRAME, timestampUs: 1_000_000n, payload: Uint8Array.of(1, 2, 3) },
      { type: PACKET_TYPE_FRAME, timestampUs: 1_016_000n, payload: Uint8Array.of(4) },
    ]);

    expect(walkPackets(bytes)).toEqual([
      { type: PACKET_TYPE_KEYFRAME, timestampUs: 1_000_000n, payloadOffset: 16, payloadSize: 3 },
      { type: PACKET_TYPE_FRAME, timestampUs: 1_016_000n, payloadOffset: 35, payloadSize: 1 },
      { type: PACKET_TYPE_CHUNK_END, timestampUs: 0n, payloadOffset: 52, payloadSize: 0 },
    ]);
  });
});

describe("walkFramePackets", () => {
  it("returns only frame packets with their payload bounds and timestamps", () => {
    const bytes = buildReplicationChunkBytes([
      { timestampUs: 5_000_000n, records: [] },
      { timestampUs: 5_016_000n, records: [] },
    ]);
    const frames = walkFramePackets(bytes);
    expect(frames.map((frame) => frame.timestampUs)).toEqual([5_000_000n, 5_016_000n]);
    expect(frames[0]?.payloadOffset).toBe(16);
    expect(frames[0]?.payloadSize).toBe(8);
  });

  it("returns no frames for empty data", () => {
    expect(walkFramePackets(new Uint8Array(0))).toEqual([]);
  });

  it("throws when a packet's declared size overruns the data", () => {
    const bytes = buildReplicationChunkBytes([{ timestampUs: 1n, records: [] }]);
    expect(() => walkFramePackets(bytes.subarray(0, 20))).toThrow(MalformedPacketStreamError);
  });

  it("throws when bytes follow the CHUNK_END packet", () => {
    const bytes = buildReplicationChunkBytes([{ timestampUs: 1n, records: [] }]);
    const padded = new Uint8Array(bytes.length + 4);
    padded.set(bytes);
    expect(() => walkFramePackets(padded)).toThrow("4 trailing bytes after its CHUNK_END packet");
  });

  it("throws when the stream ends before its CHUNK_END packet", () => {
    const bytes = buildReplicationChunkBytes([{ timestampUs: 1n, records: [] }]);
    expect(() => walkFramePackets(bytes.subarray(0, bytes.length - 16))).toThrow(MalformedPacketStreamError);
    expect(() => walkFramePackets(new Uint8Array(10))).toThrow(MalformedPacketStreamError);
  });
});
