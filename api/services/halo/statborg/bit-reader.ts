import type { ReplicationChunk } from "../types";

export const PACKET_HEADER_BYTES = 16;
export const PACKET_TYPE_FRAME = 0;
export const PACKET_TYPE_CHUNK_END = 7;

export const PACKET_TYPE_KEYFRAME = 2;
const MICROS_PER_MILLI = 1000n;

export interface FramePacket {
  timestampUs: bigint;
  payloadOffset: number;
  payloadSize: number;
}

export interface FilmPacket extends FramePacket {
  type: number;
}

export function readBitsBE(data: Uint8Array, bitPos: number, bitCount: number): number {
  let result = 0;
  let position = bitPos;
  let remaining = bitCount;
  while (remaining > 0) {
    const byte = data[position >> 3];
    if (byte == null) {
      return result;
    }
    const offset = position & 7;
    const take = Math.min(8 - offset, remaining);
    const bits = (byte >> (8 - offset - take)) & ((1 << take) - 1);
    result = result * 2 ** take + bits;
    position += take;
    remaining -= take;
  }
  return result;
}

export class MalformedPacketStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedPacketStreamError";
  }
}

// Every replication chunk ends with exactly one CHUNK_END packet and nothing after it
// (measured on all 28 chunks of the reference film), so a stream that overruns, ends early or
// carries trailing bytes is malformed and throws; consumers that need the whole film refuse it.
export function walkPackets(data: Uint8Array): FilmPacket[] {
  const packets: FilmPacket[] = [];
  if (data.length === 0) {
    return packets;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;
  while (offset + PACKET_HEADER_BYTES <= data.length) {
    const type = view.getUint16(offset, true);
    const size = view.getUint32(offset + 4, true);
    const timestampUs = view.getBigUint64(offset + 8, true);
    const payloadOffset = offset + PACKET_HEADER_BYTES;
    if (payloadOffset + size > data.length) {
      throw new MalformedPacketStreamError(`Film chunk packet stream is truncated at byte ${String(offset)}`);
    }
    packets.push({ type, timestampUs, payloadOffset, payloadSize: size });
    offset = payloadOffset + size;
    if (type === PACKET_TYPE_CHUNK_END) {
      if (offset !== data.length) {
        throw new MalformedPacketStreamError(
          `Film chunk has ${String(data.length - offset)} trailing bytes after its CHUNK_END packet`,
        );
      }
      return packets;
    }
  }
  throw new MalformedPacketStreamError(`Film chunk packet stream is truncated at byte ${String(offset)}`);
}

// frames inside a chunk are not guaranteed to arrive in clock order, so the chunk's start is
// pinned to its earliest frame rather than its first
export function earliestTimestampUs(packets: readonly FramePacket[]): bigint | null {
  let earliest: bigint | null = null;
  for (const packet of packets) {
    earliest = earliest == null || packet.timestampUs < earliest ? packet.timestampUs : earliest;
  }
  return earliest;
}

export function packetTimestampMs(chunkStartMs: number, originUs: bigint, packet: FramePacket): number {
  return chunkStartMs + Number((packet.timestampUs - originUs) / MICROS_PER_MILLI);
}

export function walkFramePackets(data: Uint8Array): FramePacket[] {
  return walkPackets(data).filter((packet) => packet.type === PACKET_TYPE_FRAME);
}

export interface DatedFrame {
  timestampMs: number;
  payload: Uint8Array;
}

function dateFrames(chunk: ReplicationChunk, frames: readonly FramePacket[]): DatedFrame[] {
  const originUs = earliestTimestampUs(frames);
  if (originUs == null) {
    return [];
  }
  return frames.map((frame) => ({
    timestampMs: packetTimestampMs(chunk.startMs, originUs, frame),
    payload: chunk.data.subarray(frame.payloadOffset, frame.payloadOffset + frame.payloadSize),
  }));
}

export function datedFrames(chunk: ReplicationChunk): DatedFrame[] {
  return dateFrames(chunk, walkFramePackets(chunk.data));
}

export interface WalkedChunk {
  index: number;
  startMs: number;
  keyframePayload: Uint8Array | null;
  frames: DatedFrame[];
}

// one walk per chunk serves every decoder stage; frames come out in clock order
export function walkChunk(chunk: ReplicationChunk): WalkedChunk {
  const packets = walkPackets(chunk.data);
  const keyframe = packets.find((packet) => packet.type === PACKET_TYPE_KEYFRAME);
  const frames = packets.filter((packet) => packet.type === PACKET_TYPE_FRAME);
  return {
    index: chunk.index,
    startMs: chunk.startMs,
    keyframePayload:
      keyframe == null
        ? null
        : chunk.data.subarray(keyframe.payloadOffset, keyframe.payloadOffset + keyframe.payloadSize),
    frames: dateFrames(chunk, frames).sort((a, b) => a.timestampMs - b.timestampMs),
  };
}
