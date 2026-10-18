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

export class TruncatedPacketError extends Error {
  constructor(offset: number) {
    super(`Film chunk packet stream is truncated at byte ${String(offset)}`);
    this.name = "TruncatedPacketError";
  }
}

// Every replication chunk ends with exactly one CHUNK_END packet (measured on all 28 chunks of
// the reference film, zero trailing bytes), so a stream that overruns or ends before it is
// truncated and throws; consumers that need the whole film can then refuse it.
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
      throw new TruncatedPacketError(offset);
    }
    if (type === PACKET_TYPE_FRAME) {
      packets.push({ timestampUs, payloadOffset, payloadSize: size });
    }
    offset = payloadOffset + size;
    if (type === PACKET_TYPE_CHUNK_END) {
      return packets;
    }
  }
  throw new TruncatedPacketError(offset);
}
