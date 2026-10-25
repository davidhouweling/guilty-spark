// a player is back a respawn after dying, never sooner, and never this much later
export const MIN_RESPAWN_MS = 1_000;
export const MAX_RESPAWN_MS = 30_000;
// the footer death clock and the packet clock share a base; the search covers residual drift
export const DEATH_MATCH_WINDOW_MS = 150;
