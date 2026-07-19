// Builds a minimal Uint8Array containing a single fire event at bit 0.
// Layout (bit positions from start of returned array):
//   [0..10]   11-bit universal marker: 0b10100100110
//   event_start = 3 (MARKER_PREFIX_BITS)
//   [35..42]  b5 byte: (playerIndex << 4) | slot
//   [43..106] weapon_id: 64-bit big-endian
export function buildFireEventBytes(playerIndex: number, slot: number, weaponId: bigint): Uint8Array {
  if (playerIndex < 0 || playerIndex > 15) {
    throw new Error(`playerIndex must be 0–15, got ${playerIndex.toString()}`);
  }
  const data = new Uint8Array(15); // 120 bits — scan needs 107 bits minimum (3+40+64)

  function setBit(bitPos: number): void {
    const byteIdx = (bitPos / 8) | 0;
    const bitIdx = 7 - (bitPos % 8);
    data[byteIdx] = (data[byteIdx] ?? 0) | (1 << bitIdx);
  }

  const markerBits = 0b10100100110;
  for (let i = 0; i < 11; i++) {
    if ((markerBits >> (10 - i)) & 1) {
      setBit(i);
    }
  }

  const b5 = (playerIndex << 4) | slot;
  for (let i = 0; i < 8; i++) {
    if ((b5 >> (7 - i)) & 1) {
      setBit(35 + i);
    }
  }

  for (let i = 0; i < 64; i++) {
    if ((weaponId >> BigInt(63 - i)) & 1n) {
      setBit(43 + i);
    }
  }

  return data;
}

// Builds a minimal Uint8Array containing a Formula A weapon-equip event.
// Layout: [marker(3), pb(1), weaponId(8)] — total 12 bytes.
//   pb = playerIndex << 5 (top 3 bits encode playerIndex 0-7)
//   weaponId is the 64-bit weapon ID, big-endian
export function buildFormulaAEventBytes(playerIndex: number, weaponId: bigint): Uint8Array {
  if (playerIndex < 0 || playerIndex > 7) {
    throw new Error(`playerIndex must be 0–7, got ${playerIndex.toString()}`);
  }
  const data = new Uint8Array(12);
  data[0] = 0x20;
  data[1] = 0x00;
  data[2] = 0x02;
  data[3] = playerIndex << 5;
  for (let i = 0; i < 8; i++) {
    data[4 + i] = Number((weaponId >> BigInt((7 - i) * 8)) & 0xffn);
  }
  return data;
}
