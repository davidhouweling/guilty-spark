import { KNOWN_WEAPON_IDS, hasCommonWeaponSuffix, lookupWeaponName, weaponIdToHex } from "./weapon-ids";

// Fire event scanner for the type-2 (replication) film chunk.
// Ported from LevelUp weapon_scanner.go (~/hobby/LevelUp).

const FRAME_MARKER = Uint8Array.of(0xa0, 0x7b, 0x42);
const UNIVERSAL_MARKER_BITS = 0b10100100110; // 11-bit marker preceding each fire event
const UNIVERSAL_MARKER_LEN = 11;
const MARKER_PREFIX_BITS = 3; // bits shared with the outer 11-bit marker before event-specific data starts
const B5_BIT_OFFSET = 32; // bits from event_start → b5 byte (playerIndex<<4|slot)
const WEAPON_BIT_OFFSET = 40; // bits from event_start → weapon_id (64-bit big-endian)
const WEAPON_ID_BITS = 64;
const DEDUP_PROXIMITY_BYTES = 2; // events within 2 bytes of each other are the same event
const KILL_WINDOW_MS = 5_000; // max ms before kill to search for a fire event

export interface FireEvent {
  timestampMs: number;
  playerIndex: number;
  weaponId: bigint;
  weaponName: string;
  bytePos: number;
}

function findFramePositions(data: Uint8Array): number[] {
  const positions: number[] = [];
  const limit = data.length - 2;
  for (let i = 0; i < limit; i++) {
    if (data[i] === FRAME_MARKER[0] && data[i + 1] === FRAME_MARKER[1] && data[i + 2] === FRAME_MARKER[2]) {
      positions.push(i);
    }
  }
  return positions;
}

function buildTimestampEstimator(data: Uint8Array, startMs: number, durationMs: number): (bytePos: number) => number {
  const frames = findFramePositions(data);

  if (frames.length === 0) {
    // No frame markers — spread timestamps linearly across the chunk by byte position.
    return (bytePos: number): number => startMs + (data.length > 0 ? bytePos / data.length : 0) * durationMs;
  }

  const frameDurMs = durationMs / frames.length;
  return (bytePos: number): number => {
    let lo = 0;
    let hi = frames.length - 1;
    let frameIdx = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const framePos = frames[mid];
      if (framePos != null && framePos <= bytePos) {
        frameIdx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return startMs + frameIdx * frameDurMs;
  };
}

function getBit(data: Uint8Array, bitPos: number): number {
  const byteIdx = (bitPos / 8) | 0;
  const bitIdx = 7 - (bitPos % 8);
  return ((data[byteIdx] ?? 0) >> bitIdx) & 1;
}

function readUint8(data: Uint8Array, bitPos: number): number {
  let result = 0;
  for (let i = 0; i < 8; i++) {
    result = (result << 1) | getBit(data, bitPos + i);
  }
  return result;
}

function readUint64(data: Uint8Array, bitPos: number): bigint {
  let result = 0n;
  for (let i = 0; i < 64; i++) {
    result = (result << 1n) | BigInt(getBit(data, bitPos + i));
  }
  return result;
}

function matchMarkerAt(data: Uint8Array, bitPos: number): boolean {
  for (let i = 0; i < UNIVERSAL_MARKER_LEN; i++) {
    const expected = (UNIVERSAL_MARKER_BITS >> (UNIVERSAL_MARKER_LEN - 1 - i)) & 1;
    if (getBit(data, bitPos + i) !== expected) {
      return false;
    }
  }
  return true;
}

export function scanFireEvents(data: Uint8Array, startMs: number, durationMs: number): FireEvent[] {
  const estimateTimestamp = buildTimestampEstimator(data, startMs, durationMs);
  const events: FireEvent[] = [];
  const totalBits = data.length * 8;
  const scanLimit = totalBits - MARKER_PREFIX_BITS - WEAPON_BIT_OFFSET - WEAPON_ID_BITS;

  for (let bitPos = 0; bitPos <= scanLimit; bitPos++) {
    if (!matchMarkerAt(data, bitPos)) {
      continue;
    }

    const eventStart = bitPos + MARKER_PREFIX_BITS;
    const weaponId = readUint64(data, eventStart + WEAPON_BIT_OFFSET);

    if (!KNOWN_WEAPON_IDS.has(weaponId) && !hasCommonWeaponSuffix(weaponId)) {
      continue;
    }

    const b5 = readUint8(data, eventStart + B5_BIT_OFFSET);
    const playerIndex = b5 >> 4;
    events.push({
      timestampMs: estimateTimestamp((bitPos / 8) | 0),
      playerIndex,
      weaponId,
      weaponName: lookupWeaponName(weaponId) ?? "Unknown",
      bytePos: (bitPos / 8) | 0,
    });
  }

  events.sort((a, b) => a.bytePos - b.bytePos);
  const deduped: FireEvent[] = [];
  let lastBytePos = Number.NEGATIVE_INFINITY;
  for (const ev of events) {
    if (ev.bytePos - lastBytePos > DEDUP_PROXIMITY_BYTES) {
      deduped.push(ev);
      lastBytePos = ev.bytePos;
    }
  }

  deduped.sort((a, b) => a.timestampMs - b.timestampMs);
  return deduped;
}

// Formula A scanner — weapon-equipped state snapshots from type-2 film chunks.
// Ported from LevelUp weapon_scanner.go ScanFormulaA.
// Marker [0x20, 0x00, 0x02] precedes a player byte (top 3 bits = playerIndex) followed
// by the 8-byte weapon ID (4-byte prefix + 4-byte COMMON_WEAPON_SUFFIX) within 68 bytes.

const FORMULA_A_MARKER = Uint8Array.of(0x20, 0x00, 0x02);
const FORMULA_A_SEARCH_WINDOW = 68;
const FORMULA_A_PLAYER_BYTE_OFFSET = 3;
const COMMON_SUFFIX_BYTES = Uint8Array.of(0x42, 0xc9, 0x67, 0x9f);
const WEAPON_SUFFIX_LENGTH = 4;

export interface FormulaAEvent {
  playerIndex: number;
  weaponId: bigint;
  weaponName: string;
}

function findBytePattern(data: Uint8Array, pattern: Uint8Array, start: number, end: number): number {
  const limit = Math.min(end, data.length) - pattern.length;
  outer: for (let i = start; i <= limit; i++) {
    for (let j = 0; j < pattern.length; j++) {
      if (data[i + j] !== pattern[j]) {
        continue outer;
      }
    }
    return i;
  }
  return -1;
}

function readBigEndian64(data: Uint8Array, pos: number): bigint {
  let result = 0n;
  for (let i = 0; i < 8; i++) {
    result = (result << 8n) | BigInt(data[pos + i] ?? 0);
  }
  return result;
}

export function scanFormulaAEvents(data: Uint8Array): FormulaAEvent[] {
  const events: FormulaAEvent[] = [];
  let pos = 0;
  while (pos < data.length) {
    const markerPos = findBytePattern(data, FORMULA_A_MARKER, pos, data.length);
    if (markerPos < 0 || markerPos + FORMULA_A_PLAYER_BYTE_OFFSET >= data.length) {
      break;
    }
    const pb = data[markerPos + FORMULA_A_PLAYER_BYTE_OFFSET] ?? 0;
    const playerIndex = pb >> 5;
    const weaponDataStart = markerPos + FORMULA_A_PLAYER_BYTE_OFFSET + 1;
    const suffixPos = findBytePattern(data, COMMON_SUFFIX_BYTES, weaponDataStart, markerPos + FORMULA_A_SEARCH_WINDOW);
    let nextPos = weaponDataStart;
    if (suffixPos >= 0) {
      const weaponStart = suffixPos - WEAPON_SUFFIX_LENGTH;
      if (weaponStart >= weaponDataStart && weaponStart + 8 <= data.length) {
        const weaponId = readBigEndian64(data, weaponStart);
        events.push({ playerIndex, weaponId, weaponName: lookupWeaponName(weaponId) ?? "Unknown" });
        nextPos = suffixPos + COMMON_SUFFIX_BYTES.length;
      }
    }
    pos = nextPos;
  }
  return events;
}

export class WeaponAttributor {
  private readonly available: FireEvent[];

  constructor(fireEvents: FireEvent[]) {
    this.available = [...fireEvents].sort((a, b) => a.timestampMs - b.timestampMs || a.bytePos - b.bytePos);
  }

  claim(playerIndex: number | null, killTimeMs: number): { weaponId: string; name: string } | null {
    // Prune events permanently before this kill's window. Kills arrive in ascending
    // time order, so pruned events cannot match any future kill either.
    const windowStart = killTimeMs - KILL_WINDOW_MS;
    let pruneCount = 0;
    while (pruneCount < this.available.length && (this.available[pruneCount]?.timestampMs ?? 0) < windowStart) {
      pruneCount++;
    }
    if (pruneCount > 0) {
      this.available.splice(0, pruneCount);
    }

    let bestIdx = -1;
    let bestTs = -Infinity;
    let bestBytePos = -1;

    for (let i = 0; i < this.available.length; i++) {
      const ev = this.available[i];
      if (ev == null) {
        continue;
      }
      if (ev.timestampMs > killTimeMs) {
        break; // events are sorted ascending, no more candidates
      }
      if (playerIndex !== null && ev.playerIndex !== playerIndex) {
        continue;
      }
      if (ev.timestampMs > bestTs || (ev.timestampMs === bestTs && ev.bytePos > bestBytePos)) {
        bestIdx = i;
        bestTs = ev.timestampMs;
        bestBytePos = ev.bytePos;
      }
    }

    if (bestIdx < 0) {
      return null;
    }
    const [ev] = this.available.splice(bestIdx, 1);
    if (ev == null) {
      return null;
    }
    return { weaponId: weaponIdToHex(ev.weaponId), name: ev.weaponName };
  }
}
