import type { ReplicationChunk } from "../../types";
import { PACKET_HEADER_BYTES, PACKET_TYPE_CHUNK_END, PACKET_TYPE_FRAME } from "../bit-reader";

// Encodes synthetic entity records in the measured FRAME grammar (see stat-records.ts) so
// scanner tests can assert on known slots, components and values.
export interface StatComponentSpec {
  index: number;
  a: number;
  b: number;
  // conditional values gated by the component's two flag bits
  conditionalA?: number | undefined;
  conditionalB?: number | undefined;
}

export interface StatRecordSpec {
  slot: number;
  components: StatComponentSpec[];
}

export interface FrameSpec {
  timestampUs: bigint;
  records: StatRecordSpec[];
}

const RECORD_GAP_BITS = 8;

export class BitWriter {
  private readonly bits: number[] = [];

  write(value: number, bitCount: number): void {
    for (let i = bitCount - 1; i >= 0; i--) {
      this.bits.push(Math.floor(value / 2 ** i) % 2);
    }
  }

  writeSigned(value: number): void {
    const width = value >= -128 && value <= 127 ? 8 : value >= -32768 && value <= 32767 ? 16 : 32;
    this.write(Math.log2(width / 8), 2);
    this.write(value < 0 ? value + 2 ** width : value, width);
  }

  toBytes(): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(this.bits.length / 8));
    for (const [position, bit] of this.bits.entries()) {
      if (bit === 1) {
        bytes[position >> 3] = (bytes[position >> 3] ?? 0) | (1 << (7 - (position & 7)));
      }
    }
    return bytes;
  }
}

function writeRecord(writer: BitWriter, record: StatRecordSpec, gapBits: number): void {
  writer.write(1, 1);
  writer.write(record.slot, 14);
  writer.write(0b10, 2);
  writer.write(0, 1);
  writer.write(record.components.length, 3);
  for (const component of record.components) {
    writer.write(component.index, 6);
  }
  for (const component of record.components) {
    writer.write(0, 5);
    writer.write(0, 5);
    writer.writeSigned(component.a);
    writer.writeSigned(component.b);
    writer.write(component.conditionalA == null ? 0 : 1, 1);
    writer.write(component.conditionalB == null ? 0 : 1, 1);
    if (component.conditionalA != null) {
      writer.writeSigned(component.conditionalA);
    }
    if (component.conditionalB != null) {
      writer.writeSigned(component.conditionalB);
    }
  }
  writer.write(0, gapBits);
}

export function buildFramePayload(records: readonly StatRecordSpec[], gapBits = RECORD_GAP_BITS): Uint8Array {
  const writer = new BitWriter();
  for (const record of records) {
    writeRecord(writer, record, gapBits);
  }
  writer.write(0, 64);
  return writer.toBytes();
}

export interface PacketSpec {
  type: number;
  timestampUs: bigint;
  payload: Uint8Array;
}

function writePacket(packet: PacketSpec): Uint8Array {
  const bytes = new Uint8Array(PACKET_HEADER_BYTES + packet.payload.length);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, packet.type, true);
  view.setUint32(4, packet.payload.length, true);
  view.setBigUint64(8, packet.timestampUs, true);
  bytes.set(packet.payload, PACKET_HEADER_BYTES);
  return bytes;
}

export function buildChunkBytes(packets: readonly PacketSpec[]): Uint8Array {
  const encoded = packets.map((packet) => writePacket(packet));
  encoded.push(writePacket({ type: PACKET_TYPE_CHUNK_END, timestampUs: 0n, payload: new Uint8Array(0) }));
  const total = encoded.reduce((sum, packet) => sum + packet.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const packet of encoded) {
    bytes.set(packet, offset);
    offset += packet.length;
  }
  return bytes;
}

export function buildReplicationChunkBytes(frames: readonly FrameSpec[]): Uint8Array {
  return buildChunkBytes(
    frames.map((frame) => ({
      type: PACKET_TYPE_FRAME,
      timestampUs: frame.timestampUs,
      payload: buildFramePayload(frame.records),
    })),
  );
}

export function aFakeReplicationChunkWith(
  frames: readonly FrameSpec[],
  overrides: Partial<Omit<ReplicationChunk, "data">> = {},
): ReplicationChunk {
  return { index: 1, startMs: 0, durationMs: 20_000, ...overrides, data: buildReplicationChunkBytes(frames) };
}
