const PACKET_HEADER_BYTES = 16;
const PACKET_TYPE_FRAME = 0;
const PACKET_TYPE_CHUNK_END = 7;

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

export function walkFramePackets(data: Uint8Array): FramePacket[] {
  const packets: FramePacket[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;
  while (offset + PACKET_HEADER_BYTES <= data.length) {
    const type = view.getUint16(offset, true);
    const size = view.getUint32(offset + 4, true);
    const timestampUs = view.getBigUint64(offset + 8, true);
    if (size > data.length) {
      break;
    }
    const payloadOffset = offset + PACKET_HEADER_BYTES;
    if (type === PACKET_TYPE_FRAME && payloadOffset + size <= data.length) {
      packets.push({ timestampUs, payloadOffset, payloadSize: size });
    }
    offset = payloadOffset + size;
    if (type === PACKET_TYPE_CHUNK_END) {
      break;
    }
  }
  return packets;
}
