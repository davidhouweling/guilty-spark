import type { ReplicationChunk } from "../../types";

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

const PACKET_HEADER_BYTES = 16;
const PACKET_TYPE_FRAME = 0;
const PACKET_TYPE_CHUNK_END = 7;
const RECORD_GAP_BITS = 8;

class BitWriter {
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

function writeRecord(writer: BitWriter, record: StatRecordSpec): void {
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
  writer.write(0, RECORD_GAP_BITS);
}

export function buildFramePayload(records: readonly StatRecordSpec[]): Uint8Array {
  const writer = new BitWriter();
  for (const record of records) {
    writeRecord(writer, record);
  }
  writer.write(0, 64);
  return writer.toBytes();
}

function writePacket(type: number, timestampUs: bigint, payload: Uint8Array): Uint8Array {
  const packet = new Uint8Array(PACKET_HEADER_BYTES + payload.length);
  const view = new DataView(packet.buffer);
  view.setUint16(0, type, true);
  view.setUint32(4, payload.length, true);
  view.setBigUint64(8, timestampUs, true);
  packet.set(payload, PACKET_HEADER_BYTES);
  return packet;
}

export function buildReplicationChunkBytes(frames: readonly FrameSpec[]): Uint8Array {
  const packets = frames.map((frame) =>
    writePacket(PACKET_TYPE_FRAME, frame.timestampUs, buildFramePayload(frame.records)),
  );
  packets.push(writePacket(PACKET_TYPE_CHUNK_END, 0n, new Uint8Array(0)));
  const total = packets.reduce((sum, packet) => sum + packet.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const packet of packets) {
    bytes.set(packet, offset);
    offset += packet.length;
  }
  return bytes;
}

export function aFakeReplicationChunkWith(
  frames: readonly FrameSpec[],
  overrides: Partial<Omit<ReplicationChunk, "data">> = {},
): ReplicationChunk {
  return { index: 1, startMs: 0, durationMs: 20_000, ...overrides, data: buildReplicationChunkBytes(frames) };
}
