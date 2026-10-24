import { readBitsBE } from "../statborg/bit-reader";
import type { AxisLayout, Quantum3 } from "./types";

// Biped delta record (LevelUp filmdec/offline_biped.go, validated to the exact quantum):
//   [1 prefix=1][13 slot][2 tag=01][2 = 00][3 mask count][6 bits x count component indices]
//   then component 0 = [gate bits = 0][X][Y][Z]
export const BIPED_HEADER_BITS = 21;
export const BIPED_INDEX_BITS = 6;
export const BIPED_SLOT_BITS = 13;
const MIN_MASK_COUNT = 2;
const MAX_MASK_COUNT = 7;

export interface BipedHeader {
  readonly slot: number;
  readonly positionBit: number;
}

export function axisOffset(layout: AxisLayout, axis: number): number {
  let offset = layout.gateBits;
  for (let index = 0; index < axis; index++) {
    offset += layout.axisWidths[index] ?? 0;
  }
  return offset;
}

export function layoutBits(layout: AxisLayout): number {
  return layout.gateBits + layout.axisWidths[0] + layout.axisWidths[1] + layout.axisWidths[2];
}

// matches the header alone (prefix, slot, tag, mask) and checks that neededBits remain after
// the position component starts; the component's own content is not assumed here
export function matchBipedHeader(
  payload: Uint8Array,
  bitPos: number,
  totalBits: number,
  slots: ReadonlySet<number>,
  neededBits: number,
): BipedHeader | null {
  if (readBitsBE(payload, bitPos, 1) !== 1) {
    return null;
  }
  const slot = readBitsBE(payload, bitPos + 1, BIPED_SLOT_BITS);
  if (!slots.has(slot)) {
    return null;
  }
  if (readBitsBE(payload, bitPos + 14, 2) !== 1 || readBitsBE(payload, bitPos + 16, 2) !== 0) {
    return null;
  }
  const maskCount = readBitsBE(payload, bitPos + 18, 3);
  if (maskCount < MIN_MASK_COUNT || maskCount > MAX_MASK_COUNT) {
    return null;
  }
  const positionBit = bitPos + BIPED_HEADER_BITS + BIPED_INDEX_BITS * maskCount;
  if (positionBit + neededBits > totalBits) {
    return null;
  }
  let previous = -1;
  for (let index = 0; index < maskCount; index++) {
    const component = readBitsBE(payload, bitPos + BIPED_HEADER_BITS + BIPED_INDEX_BITS * index, BIPED_INDEX_BITS);
    if ((index === 0 && component !== 0) || component <= previous) {
      return null;
    }
    previous = component;
  }
  return { slot, positionBit };
}

function isSaturated(q: Quantum3, layout: AxisLayout): boolean {
  return q.some((value, axis) => value === 0 || value === 2 ** (layout.axisWidths[axis] ?? 0) - 1);
}

export interface ScannedBiped {
  readonly slot: number;
  readonly q: Quantum3;
}

// Every record starts with the prefix bit and a slot from one contiguous band, so the leading
// bits every slot in the band shares form a fixed pattern after the prefix; sliding a 24-bit
// window byte by byte finds candidates without a per-bit header decode.
export interface SlotPrefilter {
  readonly bits: number;
  readonly value: number;
}

export function slotPrefilter(slots: ReadonlySet<number>): SlotPrefilter {
  const lowest = Math.min(...slots);
  const highest = Math.max(...slots);
  let shared = 0;
  while (shared < BIPED_SLOT_BITS) {
    const shift = BIPED_SLOT_BITS - shared - 1;
    if (Math.floor(lowest / 2 ** shift) !== Math.floor(highest / 2 ** shift)) {
      break;
    }
    shared += 1;
  }
  const prefix = Math.floor(lowest / 2 ** (BIPED_SLOT_BITS - shared));
  return { bits: 1 + shared, value: 2 ** shared + prefix };
}

export function forEachCandidateBit(
  payload: Uint8Array,
  prefilter: SlotPrefilter,
  limitBit: number,
  visit: (bitPos: number) => number | null,
): void {
  const mask = 2 ** prefilter.bits - 1;
  let resumeBit = 0;
  for (let byteIndex = 0; byteIndex + 2 < payload.length; byteIndex++) {
    const window =
      ((payload[byteIndex] ?? 0) << 16) | ((payload[byteIndex + 1] ?? 0) << 8) | (payload[byteIndex + 2] ?? 0);
    for (let shift = 0; shift < 8; shift++) {
      const bitPos = byteIndex * 8 + shift;
      if (bitPos < resumeBit || bitPos >= limitBit) {
        continue;
      }
      if (((window >>> (24 - prefilter.bits - shift)) & mask) !== prefilter.value) {
        continue;
      }
      const consumedTo = visit(bitPos);
      if (consumedTo != null) {
        resumeBit = consumedTo;
        byteIndex = Math.max(byteIndex, (resumeBit >> 3) - 1);
        break;
      }
    }
  }
}

// an absolute position is a record whose gate bits are all zero; a saturated axis is a clipped
// value, not a position, and is skipped
export function scanBipedRecords(payload: Uint8Array, slots: ReadonlySet<number>, layout: AxisLayout): ScannedBiped[] {
  if (slots.size === 0) {
    return [];
  }
  const totalBits = payload.length * 8;
  const componentBits = layoutBits(layout);
  const minRecordBits = BIPED_HEADER_BITS + BIPED_INDEX_BITS * MIN_MASK_COUNT + componentBits;
  const records: ScannedBiped[] = [];
  forEachCandidateBit(payload, slotPrefilter(slots), totalBits - minRecordBits + 1, (bitPos) => {
    const header = matchBipedHeader(payload, bitPos, totalBits, slots, componentBits);
    if (header == null || readBitsBE(payload, header.positionBit, layout.gateBits) !== 0) {
      return null;
    }
    const q: Quantum3 = [
      readBitsBE(payload, header.positionBit + axisOffset(layout, 0), layout.axisWidths[0]),
      readBitsBE(payload, header.positionBit + axisOffset(layout, 1), layout.axisWidths[1]),
      readBitsBE(payload, header.positionBit + axisOffset(layout, 2), layout.axisWidths[2]),
    ];
    if (!isSaturated(q, layout)) {
      records.push({ slot: header.slot, q });
    }
    return header.positionBit + componentBits;
  });
  return records;
}
