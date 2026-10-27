// HCS King of the Hill: a capture needs 40 seconds of scoring, and each film score tick
// represents ~5 seconds of it
export const KOTH_TICK_SCORING_MS = 5_000;
export const KOTH_CAPTURE_METER_MS = 40_000;
export const KOTH_FULL_METER_TICKS = KOTH_CAPTURE_METER_MS / KOTH_TICK_SCORING_MS;
