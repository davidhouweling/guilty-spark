export const HALO_PC_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HaloInfinite/6.10024.10518.0 Safari/537.36";

export const MIN_XUID = 2533274790395904n;
export const MAX_XUID = 2533274896535552n;

export const EVENT_WINDOW_BITS = 704;
export const EVENT_ENVELOPE_BYTES = 64;
export const EVENT_TERMINATOR_BYTES = Uint8Array.from([0x9f, 0x69, 0x01]);

export const KILL_HINT = 50;
export const DEATH_HINT = 20;
export const MODE_HINT = 10;

export const KILL_DEATH_PAIRING_MAX_DELTA_MS = 1;

export const PERFECT_MEDAL_NAME_ID = 1512363953;
export const PERFECTION_MEDAL_NAME_ID = 865763896;

export const MEDAL_SORTING_WEIGHTS = new Map<number, number>([
  [210, 100],
  [220, 90],
  [230, 80],
]);
