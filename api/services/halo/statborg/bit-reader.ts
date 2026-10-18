export const PACKET_HEADER_BYTES = 16;
export const PACKET_TYPE_FRAME = 0;
export const PACKET_TYPE_CHUNK_END = 7;

export interface FramePacket {
  timestampUs: bigint;
  payloadOffset: number;
  payloadSize: number;
}

export function readBitsBE(data: Uint8Array, bitPos: number, bitCount: number): number {
  let result = 0;
  for (let i = 0; i < bitCount; i++) {
    const position = bitPos + i;
    const byte = data[position >> 3];
    if (byte == null) {
      return result;
    }
    const bit = (byte >> (7 - (position & 7))) & 1;
    result = result * 2 + bit;
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
export function walkFramePackets(data: Uint8Array): FramePacket[] {
  const packets: FramePacket[] = [];
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
    if (type === PACKET_TYPE_FRAME) {
      packets.push({ timestampUs, payloadOffset, payloadSize: size });
    }
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
