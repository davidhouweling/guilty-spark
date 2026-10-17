import type { ReplicationChunk } from "../types";
import { readBitsBE, walkFramePackets } from "./bit-reader";
import type { StatRecord, StatValue } from "./types";

// Entity-record grammar of the replication FRAME packets, measured by LevelUp against a
// Cheat Engine capture (apps/go-api/internal/analysis/objectiveevents/statborg.go):
//   [1 bit = 1][14 bits slot][2 bits = 10][1 bit = 0][3 bits N][N x 6 bits component index]
//   then per index: [5 bits = 0][5 bits = 0][value A][value B][2 flags][conditional values]
// Values are signed with a 2-bit width selector (8 << selector bits).
const SLOT_BITS = 14;
const GENERATION_BITS = 2;
const GENERATION_VALUE = 0b10;
const COMPONENT_COUNT_BITS = 3;
const COMPONENT_INDEX_BITS = 6;
const COMPONENT_HEADER_BITS = 5;
const MAX_COMPONENT_INDEX = 58;
const MAX_COMPONENTS_PER_RECORD = 7;
const MIN_SLOT = 6;
const MAX_SLOT = 24;
// LevelUp's measured end-of-payload margin below which no record anchors
const TAIL_BITS = 64;
const MAX_VALUE_BITS = 32;
const WIDTH_SELECTOR_BITS = 2;
const MICROS_PER_MILLI = 1000n;

interface RecordHeader {
  slot: number;
  componentIndices: number[];
  firstComponentBit: number;
}

interface DecodedValue {
  value: number;
  bitsConsumed: number;
}

function readVariableWidthValue(payload: Uint8Array, bitPos: number): DecodedValue | null {
  const totalBits = payload.length * 8;
  if (bitPos < 0 || bitPos + WIDTH_SELECTOR_BITS > totalBits) {
    return null;
  }
  const width = 8 << readBitsBE(payload, bitPos, WIDTH_SELECTOR_BITS);
  if (width > MAX_VALUE_BITS || bitPos + WIDTH_SELECTOR_BITS + width > totalBits) {
    return null;
  }
  const raw = readBitsBE(payload, bitPos + WIDTH_SELECTOR_BITS, width);
  const value = raw >= 2 ** (width - 1) ? raw - 2 ** width : raw;
  return { value, bitsConsumed: WIDTH_SELECTOR_BITS + width };
}

function decodeComponent(payload: Uint8Array, bitPos: number): { value: StatValue; bitsConsumed: number } | null {
  let cursor = bitPos + 2 * COMPONENT_HEADER_BITS;
  const a = readVariableWidthValue(payload, cursor);
  if (a == null) {
    return null;
  }
  const b = readVariableWidthValue(payload, cursor + a.bitsConsumed);
  if (b == null) {
    return null;
  }
  cursor += a.bitsConsumed + b.bitsConsumed;
  if (cursor + 2 > payload.length * 8) {
    return null;
  }
  const flags = [readBitsBE(payload, cursor, 1), readBitsBE(payload, cursor + 1, 1)];
  cursor += 2;
  for (const flag of flags) {
    if (flag !== 1) {
      continue;
    }
    const conditional = readVariableWidthValue(payload, cursor);
    if (conditional == null) {
      return null;
    }
    cursor += conditional.bitsConsumed;
  }
  return { value: { a: a.value, b: b.value }, bitsConsumed: cursor - bitPos };
}

function matchRecordHeader(payload: Uint8Array, bitPos: number): RecordHeader | null {
  if (readBitsBE(payload, bitPos - 1, 1) !== 1) {
    return null;
  }
  const slot = readBitsBE(payload, bitPos, SLOT_BITS);
  if (slot < MIN_SLOT || slot > MAX_SLOT || slot % 2 !== 0) {
    return null;
  }
  if (readBitsBE(payload, bitPos + SLOT_BITS, GENERATION_BITS) !== GENERATION_VALUE) {
    return null;
  }
  const maskBit = bitPos + SLOT_BITS + GENERATION_BITS;
  if (readBitsBE(payload, maskBit, 1) !== 0) {
    return null;
  }
  const componentCount = readBitsBE(payload, maskBit + 1, COMPONENT_COUNT_BITS);
  if (componentCount < 1 || componentCount > MAX_COMPONENTS_PER_RECORD) {
    return null;
  }
  const indicesStart = maskBit + 1 + COMPONENT_COUNT_BITS;
  const componentIndices: number[] = [];
  let previous = -1;
  for (let i = 0; i < componentCount; i++) {
    const index = readBitsBE(payload, indicesStart + COMPONENT_INDEX_BITS * i, COMPONENT_INDEX_BITS);
    if (index >= MAX_COMPONENT_INDEX || index <= previous) {
      return null;
    }
    componentIndices.push(index);
    previous = index;
  }
  return { slot, componentIndices, firstComponentBit: indicesStart + COMPONENT_INDEX_BITS * componentCount };
}

interface DecodedComponents {
  components: Map<number, StatValue>;
  endBit: number;
}

// Only the first component's two zero headers are enforced: measured at 99.1% of real
// components, which is enough to reject chance header matches without dropping the real
// records whose later components carry a non-zero header.
function decodeComponents(payload: Uint8Array, header: RecordHeader): DecodedComponents {
  const components = new Map<number, StatValue>();
  const { firstComponentBit } = header;
  if (
    readBitsBE(payload, firstComponentBit, COMPONENT_HEADER_BITS) !== 0 ||
    readBitsBE(payload, firstComponentBit + COMPONENT_HEADER_BITS, COMPONENT_HEADER_BITS) !== 0
  ) {
    return { components, endBit: firstComponentBit };
  }
  let cursor = firstComponentBit;
  for (const index of header.componentIndices) {
    const component = decodeComponent(payload, cursor);
    if (component == null) {
      // a record whose declared components do not all decode is a chance match, not a record
      return { components: new Map(), endBit: firstComponentBit };
    }
    components.set(index, component.value);
    cursor += component.bitsConsumed;
  }
  return { components, endBit: cursor };
}

// Every record starts with the prefix bit followed by a slot of at most 24, so the ten bits
// from the prefix read 1 then nine zeros; sliding a 24-bit window byte by byte finds those
// candidates without a per-bit decode.
const PREFIX_WINDOW_BITS = 10;
const PREFIX_WINDOW_VALUE = 0b10_0000_0000;
const PREFIX_WINDOW_MASK = (1 << PREFIX_WINDOW_BITS) - 1;

function decodeRecordAt(
  payload: Uint8Array,
  bitPos: number,
  timestampMs: number,
): { record: StatRecord; endBit: number } | null {
  const header = matchRecordHeader(payload, bitPos);
  if (header == null) {
    return null;
  }
  const { components, endBit } = decodeComponents(payload, header);
  if (components.size === 0) {
    return null;
  }
  return { record: { timestampMs, slot: header.slot, components }, endBit };
}

export function scanFrameForStatRecords(payload: Uint8Array, timestampMs: number): StatRecord[] {
  const records: StatRecord[] = [];
  const limit = payload.length * 8 - TAIL_BITS;
  let resumeBit = 0;
  for (let byteIndex = 0; byteIndex + 2 < payload.length; byteIndex++) {
    const window =
      ((payload[byteIndex] ?? 0) << 16) | ((payload[byteIndex + 1] ?? 0) << 8) | (payload[byteIndex + 2] ?? 0);
    for (let shift = 0; shift < 8; shift++) {
      const prefixBit = byteIndex * 8 + shift;
      const bitPos = prefixBit + 1;
      if (prefixBit < resumeBit || bitPos >= limit) {
        continue;
      }
      if (((window >>> (24 - PREFIX_WINDOW_BITS - shift)) & PREFIX_WINDOW_MASK) !== PREFIX_WINDOW_VALUE) {
        continue;
      }
      const decoded = decodeRecordAt(payload, bitPos, timestampMs);
      if (decoded != null) {
        records.push(decoded.record);
        resumeBit = decoded.endBit;
        byteIndex = Math.max(byteIndex, (resumeBit >> 3) - 1);
        break;
      }
    }
  }
  return records;
}

export function scanChunkStatRecords(chunk: ReplicationChunk): StatRecord[] {
  const frames = walkFramePackets(chunk.data);
  const [firstFrame] = frames;
  if (firstFrame == null) {
    return [];
  }
  let originUs = firstFrame.timestampUs;
  for (const frame of frames) {
    originUs = frame.timestampUs < originUs ? frame.timestampUs : originUs;
  }
  const records: StatRecord[] = [];
  for (const frame of frames) {
    const timestampMs = chunk.startMs + Number((frame.timestampUs - originUs) / MICROS_PER_MILLI);
    const payload = chunk.data.subarray(frame.payloadOffset, frame.payloadOffset + frame.payloadSize);
    for (const record of scanFrameForStatRecords(payload, timestampMs)) {
      records.push(record);
    }
  }
  return records;
}

export function sortStatRecords(records: readonly StatRecord[]): StatRecord[] {
  return [...records].sort((left, right) => left.timestampMs - right.timestampMs || left.slot - right.slot);
}
