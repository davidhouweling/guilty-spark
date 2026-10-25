import type { MatchStats } from "halo-infinite-api";
import { namePositionsOrEmpty } from "../../positions/name-positions-or-empty";
import type { DeathEvent, PlayerPositions } from "../../positions/types";
import { walkChunk } from "../../statborg/bit-reader";
import { buildCtfFlagEventsFromRecords } from "../../statborg/ctf-flag-events";
import { scanWalkedChunkStatRecords, sortStatRecords } from "../../statborg/stat-records";
import type { CtfFlagEvents, StatRecord } from "../../statborg/types";
import type { ReplicationChunk } from "../../types";

export interface DecodedCtfFilm {
  readonly flagEvents: CtfFlagEvents["events"];
  readonly unresolvedSlots: CtfFlagEvents["unresolvedSlots"];
  readonly positions: PlayerPositions;
}

export function flagEventsFromRecords(records: readonly StatRecord[], matchStats: MatchStats): CtfFlagEvents {
  return buildCtfFlagEventsFromRecords(sortStatRecords(records), matchStats);
}

// one walk per chunk serves both decoders, and the inflated film is out of scope again once
// this returns
export function decodeCtfFilm(
  chunks: readonly ReplicationChunk[],
  matchStats: MatchStats,
  deaths: readonly DeathEvent[],
): DecodedCtfFilm {
  const walked = chunks.map(walkChunk);
  const records = walked.flatMap((chunk) => scanWalkedChunkStatRecords(chunk));
  const { events: flagEvents, unresolvedSlots } = flagEventsFromRecords(records, matchStats);
  return { flagEvents, unresolvedSlots, positions: namePositionsOrEmpty(walked, matchStats, deaths) };
}
