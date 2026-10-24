import type { ReplicationChunk } from "../types";
import { PACKET_TYPE_KEYFRAME, readBitsBE, walkPackets } from "../statborg/bit-reader";

// Keyframe (full-state) packets list every live entity as [id:32][field:26][ti:6]; id>>30 is a
// generation 1..3 and id & 0x3FFFFFFF the slot. Bipeds are archetype 35 and are allocated in a
// contiguous slot band. Grammar and walker measured by LevelUp (filmdec/keyframe_world.go).
const SENTINEL_ID = 0xffff_ffff;
const SLOT_CAP = 8192;
const ARCHETYPE_CAP = 50;
const BIPED_ARCHETYPE = 35;
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
  if (readBitsBE(payload, bitPos + 32, 32) >= ARCHETYPE_CAP) {
    return null;
  }
  return { slot, archetype: readBitsBE(payload, bitPos + 58, 6), generation };
}

interface Candidate {
  readonly consecutive: number;
  readonly generation: number;
  readonly slot: number;
  readonly bit: number;
}

// consecutive slot first, then the lowest generation, slot and bit position
function isBetter(candidate: Candidate, best: Candidate): boolean {
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

function scanNextAnchor(payload: Uint8Array, from: number, previousSlot: number, totalBits: number): number {
  let at = -1;
  let best: Candidate = { consecutive: -1, generation: 2 ** 30, slot: 2 ** 30, bit: 2 ** 30 };
  const end = Math.min(from + SCAN_WINDOW_BITS, totalBits);
  let sentinelStreak = 0;
  for (let bitPos = from; bitPos + RECORD_HEADER_BITS <= end; bitPos++) {
    if (readBitsBE(payload, bitPos, 32) === SENTINEL_ID) {
      sentinelStreak += 1;
      if (sentinelStreak >= MAX_SENTINEL_STREAK) {
        break;
      }
      continue;
    }
    sentinelStreak = 0;
    const anchor = readAnchor(payload, bitPos, previousSlot, totalBits);
    if (anchor == null) {
      continue;
    }
    if (anchor.slot === previousSlot + 1 && anchor.generation === 1) {
      return bitPos;
    }
    const candidate: Candidate = {
      consecutive: anchor.slot === previousSlot + 1 ? 1 : 0,
      generation: anchor.generation,
      slot: anchor.slot,
      bit: bitPos,
    };
    if (at < 0 || isBetter(candidate, best)) {
      at = bitPos;
      best = candidate;
    }
  }
  return at;
}

export function walkKeyframeRecords(payload: Uint8Array): KeyframeAnchor[] {
  const totalBits = payload.length * 8;
  const widthByArchetype = new Map<number, number>();
  const seenWidthByArchetype = new Map<number, number>();
  const records: KeyframeAnchor[] = [];
  let bitPos = 1;
  let previousSlot = -1;
  if (readAnchor(payload, bitPos, previousSlot, totalBits) == null) {
    bitPos = scanNextAnchor(payload, bitPos, previousSlot, totalBits);
  }
  while (bitPos >= 0) {
    const anchor = readAnchor(payload, bitPos, previousSlot, totalBits);
    if (anchor == null) {
      break;
    }
    const stateStart = bitPos + RECORD_HEADER_BITS;
    const knownWidth = widthByArchetype.get(anchor.archetype);
    const jumped = knownWidth == null ? null : readAnchor(payload, stateStart + knownWidth, anchor.slot, totalBits);
    // a known archetype width is only trusted onto an unambiguous generation-1 record
    const next =
      knownWidth != null && jumped?.generation === 1
        ? stateStart + knownWidth
        : scanNextAnchor(payload, stateStart, anchor.slot, totalBits);
    records.push(anchor);
    previousSlot = anchor.slot;
    if (next < 0) {
      break;
    }
    const width = next - stateStart;
    const seenWidth = seenWidthByArchetype.get(anchor.archetype);
    if (seenWidth == null) {
      seenWidthByArchetype.set(anchor.archetype, width);
    } else if (seenWidth === width) {
      widthByArchetype.set(anchor.archetype, width);
    } else {
      widthByArchetype.delete(anchor.archetype);
    }
    bitPos = next;
  }
  return records;
}

function firstKeyframePayload(chunk: ReplicationChunk): Uint8Array | null {
  const packet = walkPackets(chunk.data).find((candidate) => candidate.type === PACKET_TYPE_KEYFRAME);
  return packet == null ? null : chunk.data.subarray(packet.payloadOffset, packet.payloadOffset + packet.payloadSize);
}

// bipeds live in one contiguous slot band, and a biped created then destroyed inside a chunk
// appears in no keyframe, so the gaps between the lowest and highest seen slots are filled
export function bipedSlotBand(chunks: readonly ReplicationChunk[]): Set<number> {
  const seen = new Set<number>();
  for (const chunk of chunks) {
    const payload = firstKeyframePayload(chunk);
    if (payload == null) {
      continue;
    }
    for (const record of walkKeyframeRecords(payload)) {
      if (record.archetype === BIPED_ARCHETYPE) {
        seen.add(record.slot);
      }
    }
  }
  if (seen.size === 0) {
    return seen;
  }
  const band = new Set<number>();
  for (let slot = Math.min(...seen); slot <= Math.max(...seen); slot++) {
    band.add(slot);
  }
  return band;
}
