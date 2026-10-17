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

function decodeComponents(payload: Uint8Array, header: RecordHeader): Map<number, StatValue> {
  const components = new Map<number, StatValue>();
  const { firstComponentBit } = header;
  if (
    readBitsBE(payload, firstComponentBit, COMPONENT_HEADER_BITS) !== 0 ||
    readBitsBE(payload, firstComponentBit + COMPONENT_HEADER_BITS, COMPONENT_HEADER_BITS) !== 0
  ) {
    return components;
  }
  let cursor = firstComponentBit;
  for (const index of header.componentIndices) {
    const component = decodeComponent(payload, cursor);
    if (component == null) {
      break;
    }
    components.set(index, component.value);
    cursor += component.bitsConsumed;
  }
  return components;
}

export function scanFrameForStatRecords(payload: Uint8Array, timestampMs: number): StatRecord[] {
  const records: StatRecord[] = [];
  const limit = payload.length * 8 - TAIL_BITS;
  for (let bitPos = 1; bitPos < limit; bitPos++) {
    const header = matchRecordHeader(payload, bitPos);
    if (header == null) {
      continue;
    }
    const components = decodeComponents(payload, header);
    if (components.size > 0) {
      records.push({ timestampMs, slot: header.slot, components });
    }
  }
  return records;
}

function scanChunk(chunk: ReplicationChunk): StatRecord[] {
  const frames = walkFramePackets(chunk.data);
  const [firstFrame] = frames;
  if (firstFrame == null) {
    return [];
  }
  const records: StatRecord[] = [];
  for (const frame of frames) {
    const timestampMs = chunk.startMs + Number((frame.timestampUs - firstFrame.timestampUs) / MICROS_PER_MILLI);
    const payload = chunk.data.subarray(frame.payloadOffset, frame.payloadOffset + frame.payloadSize);
    records.push(...scanFrameForStatRecords(payload, timestampMs));
  }
  return records;
}

export function scanStatRecords(chunks: readonly ReplicationChunk[]): StatRecord[] {
  const records: StatRecord[] = [];
  for (const chunk of chunks) {
    records.push(...scanChunk(chunk));
  }
  return records.sort((left, right) => left.timestampMs - right.timestampMs || left.slot - right.slot);
}
