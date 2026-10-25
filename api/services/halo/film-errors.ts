import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { SkippedReplicationChunk } from "./types";

// a film decoder needs every replication chunk: a malformed, empty or missing chunk is a
// hole in the match clock, so the whole decode is refused rather than silently shortened
export class IncompleteFilmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncompleteFilmError";
  }
}

export function skippedReplicationChunkError(matchId: string, skipped: SkippedReplicationChunk): IncompleteFilmError {
  switch (skipped.reason) {
    case "malformed": {
      return new IncompleteFilmError(
        `Film for match ${matchId} has a malformed replication chunk: ${String(skipped.index)}`,
      );
    }
    case "empty": {
      return new IncompleteFilmError(
        `Film for match ${matchId} has an empty replication chunk: ${String(skipped.index)}`,
      );
    }
    default: {
      throw new UnreachableError(skipped.reason);
    }
  }
}

export function noReplicationChunksError(matchId: string): IncompleteFilmError {
  return new IncompleteFilmError(`Film for match ${matchId} has no replication chunks`);
}
