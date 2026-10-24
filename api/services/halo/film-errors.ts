// a film decoder needs every replication chunk: a malformed, empty or missing chunk is a
// hole in the match clock, so the whole decode is refused rather than silently shortened
export class IncompleteFilmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncompleteFilmError";
  }
}

export function malformedReplicationChunkError(matchId: string, chunkIndex: number): IncompleteFilmError {
  return new IncompleteFilmError(`Film for match ${matchId} has a malformed replication chunk: ${String(chunkIndex)}`);
}

export function emptyReplicationChunkError(matchId: string, chunkIndex: number): IncompleteFilmError {
  return new IncompleteFilmError(`Film for match ${matchId} has an empty replication chunk: ${String(chunkIndex)}`);
}

export function noReplicationChunksError(matchId: string): IncompleteFilmError {
  return new IncompleteFilmError(`Film for match ${matchId} has no replication chunks`);
}
