import type { MatchStats } from "halo-infinite-api";
import { namePositionsOrEmpty } from "../../positions/name-positions-or-empty";
import { toDeathEvents } from "../../positions/death-events";
import type { PlayerPositions } from "../../positions/types";
import { walkChunk } from "../../statborg/bit-reader";
import { buildCtfFlagEventsFromRecords } from "../../statborg/ctf-flag-events";
import { scanWalkedChunkStatRecords } from "../../statborg/stat-records";
import type { CtfFlagEvents } from "../../statborg/types";
import type { ParsedHighlightEvent, ReplicationChunk } from "../../types";

// positionsFailure names the decode failure when the bipeds could not be read; the flag events
// still stand on their own
export interface DecodedCtfFilm {
  readonly flagEvents: CtfFlagEvents["events"];
  readonly unresolvedSlots: CtfFlagEvents["unresolvedSlots"];
  readonly positions: PlayerPositions;
  readonly positionsFailure: string | null;
}

// one walk per chunk serves both decoders, and the inflated film is out of scope again once
// this returns
export function decodeCtfFilm(
  chunks: readonly ReplicationChunk[],
  matchStats: MatchStats,
  highlightEvents: readonly ParsedHighlightEvent[],
): DecodedCtfFilm {
  const walked = chunks.map(walkChunk);
  const records = walked.flatMap((chunk) => scanWalkedChunkStatRecords(chunk));
  const { events: flagEvents, unresolvedSlots } = buildCtfFlagEventsFromRecords(records, matchStats, highlightEvents);
  const { positions, failure: positionsFailure } = namePositionsOrEmpty(
    walked,
    matchStats,
    toDeathEvents(highlightEvents),
  );
  return { flagEvents, unresolvedSlots, positions, positionsFailure };
}
