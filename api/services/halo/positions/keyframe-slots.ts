import { readBitsBE } from "../statborg/bit-reader";
import type { WalkedChunk } from "../statborg/bit-reader";

// Keyframe (full-state) packets list every live entity as [id:32][field:26][ti:6]; id>>30 is a
// generation 1..3 and id & 0x3FFFFFFF the slot. Bipeds are archetype 35 and are allocated in a
// contiguous slot band. Grammar and walker measured by LevelUp (filmdec/keyframe_world.go).
const SENTINEL_ID = 0xffff_ffff;
const SLOT_CAP = 8192;
const ARCHETYPE_CAP = 50;
export const BIPED_ARCHETYPE = 35;
const RECORD_HEADER_BITS = 64;
const SCAN_WINDOW_BITS = 120_000;
const MAX_SENTINEL_STREAK = 2048;

interface KeyframeAnchor {
  readonly slot: number;
  readonly archetype: number;
  readonly generation: number;
}

function readAnchor(
  payload: Uint8Array,
  bitPos: number,
  previousSlot: number,
  totalBits: number,
): KeyframeAnchor | null {
  if (bitPos < 0 || bitPos + RECORD_HEADER_BITS > totalBits) {
    return null;
  }
  const id = readBitsBE(payload, bitPos, 32);
  if (id === SENTINEL_ID) {
    return null;
  }
  const generation = Math.floor(id / 2 ** 30);
  if (generation === 0) {
    return null;
  }
  const slot = id % 2 ** 30;
  if (slot <= previousSlot || slot >= SLOT_CAP) {
    return null;
  }
  const archetype = readBitsBE(payload, bitPos + 58, 6);
  if (readBitsBE(payload, bitPos + 32, 26) !== 0 || archetype >= ARCHETYPE_CAP) {
    return null;
  }
  return { slot, archetype, generation };
}

interface Candidate {
  readonly consecutive: number;
  readonly generation: number;
  readonly slot: number;
  readonly bit: number;
}

function prefersConsecutiveThenLowest(candidate: Candidate, best: Candidate): boolean {
  if (candidate.consecutive !== best.consecutive) {
    return candidate.consecutive > best.consecutive;
  }
  if (candidate.generation !== best.generation) {
    return candidate.generation < best.generation;
  }
  if (candidate.slot !== best.slot) {
    return candidate.slot < best.slot;
  }
  return candidate.bit < best.bit;
}

function bitAt(payload: Uint8Array, bitPos: number): number {
  return ((payload[bitPos >> 3] ?? 0) >> (7 - (bitPos & 7))) & 1;
}

// the two 32-bit words of a record header slide one bit per step, so each candidate is judged
// with a few integer operations instead of a fresh read
function scanNextAnchor(payload: Uint8Array, from: number, previousSlot: number, totalBits: number): number {
  const end = Math.min(from + SCAN_WINDOW_BITS, totalBits);
  if (from + RECORD_HEADER_BITS > end) {
    return -1;
  }
  let id = readBitsBE(payload, from, 32);
  let field = readBitsBE(payload, from + 32, 32);
  let at = -1;
  let best: Candidate = { consecutive: -1, generation: 2 ** 30, slot: 2 ** 30, bit: 2 ** 30 };
  let sentinelStreak = 0;
  for (let bitPos = from; bitPos + RECORD_HEADER_BITS <= end; bitPos++) {
    if (bitPos > from) {
      id = ((id << 1) | (field >>> 31)) >>> 0;
      field = ((field << 1) | bitAt(payload, bitPos + RECORD_HEADER_BITS - 1)) >>> 0;
    }
    if (id === SENTINEL_ID) {
      sentinelStreak += 1;
      if (sentinelStreak >= MAX_SENTINEL_STREAK) {
        break;
      }
      continue;
    }
    sentinelStreak = 0;
    const generation = id >>> 30;
    const slot = id & 0x3fff_ffff;
    // the field word is [field:26][ti:6], so a value under the cap means field 0 and a small ti
    if (generation === 0 || slot <= previousSlot || slot >= SLOT_CAP || field >= ARCHETYPE_CAP) {
      continue;
    }
    if (slot === previousSlot + 1 && generation === 1) {
      return bitPos;
    }
    const candidate: Candidate = { consecutive: slot === previousSlot + 1 ? 1 : 0, generation, slot, bit: bitPos };
    if (at < 0 || prefersConsecutiveThenLowest(candidate, best)) {
      at = bitPos;
      best = candidate;
    }
  }
  return at;
}

// a record's state width is fixed per archetype; it is learned when two records of the same
// archetype agree and forgotten the moment one disagrees
class ArchetypeWidths {
  private readonly seen = new Map<number, number>();
  private readonly trusted = new Map<number, number>();

  learn(archetype: number, width: number): void {
    const seenWidth = this.seen.get(archetype);
    if (seenWidth === width) {
      this.trusted.set(archetype, width);
      return;
    }
    this.seen.set(archetype, width);
    this.trusted.delete(archetype);
  }

  trustedWidth(archetype: number): number | null {
    return this.trusted.get(archetype) ?? null;
  }
}

// a known archetype width is only trusted onto an unambiguous generation-1 record
function nextAnchorBit(
  payload: Uint8Array,
  anchor: KeyframeAnchor,
  stateStart: number,
  widths: ArchetypeWidths,
  totalBits: number,
): number {
  const knownWidth = widths.trustedWidth(anchor.archetype);
  if (knownWidth != null && readAnchor(payload, stateStart + knownWidth, anchor.slot, totalBits)?.generation === 1) {
    return stateStart + knownWidth;
  }
  return scanNextAnchor(payload, stateStart, anchor.slot, totalBits);
}

function firstAnchorBit(payload: Uint8Array, totalBits: number): number {
  return readAnchor(payload, 1, -1, totalBits) == null ? scanNextAnchor(payload, 1, -1, totalBits) : 1;
}

export function walkKeyframeRecords(payload: Uint8Array): KeyframeAnchor[] {
  const totalBits = payload.length * 8;
  const widths = new ArchetypeWidths();
  const records: KeyframeAnchor[] = [];
  let bitPos = firstAnchorBit(payload, totalBits);
  let previousSlot = -1;
  while (bitPos >= 0) {
    const anchor = readAnchor(payload, bitPos, previousSlot, totalBits);
    if (anchor == null) {
      break;
    }
    records.push(anchor);
    previousSlot = anchor.slot;
    const stateStart = bitPos + RECORD_HEADER_BITS;
    const next = nextAnchorBit(payload, anchor, stateStart, widths, totalBits);
    if (next < 0) {
      break;
    }
    widths.learn(anchor.archetype, next - stateStart);
    bitPos = next;
  }
  return records;
}

// a biped created and destroyed between two keyframes appears in neither, so the band between
// the lowest and highest seen slots is filled, and slots allocated after the final keyframe
// are covered by a tail of spare slots above the top
export function bipedSlotBand(chunks: readonly WalkedChunk[], tailSlots: number): Set<number> {
  const seen = new Set<number>();
  for (const chunk of chunks) {
    if (chunk.keyframePayload == null) {
      continue;
    }
    for (const record of walkKeyframeRecords(chunk.keyframePayload)) {
      if (record.archetype === BIPED_ARCHETYPE) {
        seen.add(record.slot);
      }
    }
  }
  if (seen.size === 0) {
    return seen;
  }
  const band = new Set<number>();
  for (let slot = Math.min(...seen); slot <= Math.min(Math.max(...seen) + tailSlots, SLOT_CAP - 1); slot++) {
    band.add(slot);
  }
  return band;
}
