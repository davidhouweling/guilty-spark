import type { MatchStats } from "halo-infinite-api";
import type { WalkedChunk } from "../statborg/bit-reader";
import { AxisLayoutError } from "./axis-layout";
import { decodePositions, emptyPlayerPositions, namePositions, PositionDecodeError } from "./build-player-positions";
import type { DeathEvent, PlayerPositions } from "./types";

// a film whose bipeds cannot be decoded still has its flag events and score, so the caller
// gets positions without tracks rather than no result; anything else is a real failure
export function namePositionsOrEmpty(
  walked: readonly WalkedChunk[],
  matchStats: MatchStats,
  deaths: readonly DeathEvent[],
): PlayerPositions {
  try {
    return namePositions(decodePositions(walked, matchStats), matchStats, deaths);
  } catch (error: unknown) {
    if (error instanceof PositionDecodeError || error instanceof AxisLayoutError) {
      return emptyPlayerPositions();
    }
    throw error;
  }
}
