export const HALO_PC_USER_AGENT = "SHIVA-2043073184/6.10021.18539.0 (release; PC)";

export const MIN_XUID = 2_000_000_000_000_000n;
export const MAX_XUID = 3_000_000_000_000_000n;

export const EVENT_WINDOW_BITS = 20_000;
export const EVENT_ENVELOPE_BYTES = 60;
export const EVENT_TERMINATOR_BYTES = Uint8Array.of(0x00, 0x00, 0x2e, 0xe0);

export const KILL_HINT = 50;
export const DEATH_HINT = 20;
export const MODE_HINT = 10;

export const KILL_DEATH_PAIRING_MAX_DELTA_MS = 1;

export const PERFECT_MEDAL_NAME_ID = 1512363953;
export const PERFECTION_MEDAL_NAME_ID = 865763896;

export const MEDAL_SORTING_WEIGHTS = new Set<number>([
  50, 51, 52, 100, 101, 150, 200, 205, 210, 220, 225, 230, 235, 240, 245, 250,
]);
