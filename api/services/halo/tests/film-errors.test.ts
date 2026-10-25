import { describe, expect, it } from "vitest";
import { IncompleteFilmError, noReplicationChunksError, skippedReplicationChunkError } from "../film-errors";

describe("skippedReplicationChunkError", () => {
  it("names the chunk and the reason it was skipped", () => {
    const malformed = skippedReplicationChunkError("match-1", { index: 2, startMs: 0, reason: "malformed" });
    const empty = skippedReplicationChunkError("match-1", { index: 3, startMs: 0, reason: "empty" });

    expect(malformed).toBeInstanceOf(IncompleteFilmError);
    expect(malformed.message).toBe("Film for match match-1 has a malformed replication chunk: 2");
    expect(empty.message).toBe("Film for match match-1 has an empty replication chunk: 3");
  });
});

describe("noReplicationChunksError", () => {
  it("names the match that has no replication chunks", () => {
    expect(noReplicationChunksError("match-1").message).toBe("Film for match match-1 has no replication chunks");
  });
});
