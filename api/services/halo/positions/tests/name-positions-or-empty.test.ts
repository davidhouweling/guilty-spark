import { describe, expect, it } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { walkChunk } from "../../statborg/bit-reader";
import { aFakeCtfMatchStatsWith } from "../../statborg/fakes/ctf-match-stats.fake";
import { aFakeReplicationChunkWith } from "../../statborg/fakes/replication-chunk.fake";
import { aFakePositionFilmWith } from "../fakes/position-film.fake";
import { namePositionsOrEmpty } from "../name-positions-or-empty";

describe("namePositionsOrEmpty", () => {
  it("returns positions without tracks when the film lists no biped slots", () => {
    const walked = [walkChunk(aFakeReplicationChunkWith([{ timestampUs: 1_000_000n, records: [] }]))];

    const positions = namePositionsOrEmpty(walked, aFakeCtfMatchStatsWith(), []);

    expect(positions.tracks).toEqual([]);
    expect(positions.feedOffsetMs).toBeNull();
  });

  it("names positions from a decodable film", () => {
    const walked = aFakePositionFilmWith({ lives: [{ slot: 512, startMs: 1000, endMs: 20_000 }] }).map(walkChunk);

    const positions = namePositionsOrEmpty(walked, aFakeCtfMatchStatsWith(), [
      { timestampMs: 20_000, xuid: "0100000000000000" },
    ]);

    expect(positions.tracks.map((track) => track.xuid)).toEqual(["0100000000000000"]);
  });

  it("rethrows failures that are not decode failures", () => {
    const [chunk] = aFakePositionFilmWith({ lives: [{ slot: 512, startMs: 1000, endMs: 20_000 }] }).map(walkChunk);
    const broken = {
      ...Preconditions.checkExists(chunk),
      get frames(): never {
        throw new Error("unexpected");
      },
    };

    expect(() => namePositionsOrEmpty([broken], aFakeCtfMatchStatsWith(), [])).toThrow("unexpected");
  });
});
