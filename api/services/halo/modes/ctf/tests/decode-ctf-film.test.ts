import { describe, expect, it } from "vitest";
import { aFakeParsedHighlightEventWith } from "../../../fakes/parsed-highlight-event.fake";
import { aFakePositionFilmWith } from "../../../positions/fakes/position-film.fake";
import { aFakeCtfMatchStatsWith } from "../../../statborg/fakes/ctf-match-stats.fake";
import { aFakeReplicationChunkWith } from "../../../statborg/fakes/replication-chunk.fake";
import { decodeCtfFilm } from "../decode-ctf-film";

const identityFrames = [
  {
    timestampUs: 41_500_000n,
    records: [
      { slot: 10, components: [{ index: 2, a: 16, b: 17 }] },
      { slot: 10, components: [{ index: 3, a: 12, b: 0 }] },
    ],
  },
  { timestampUs: 45_000_000n, records: [{ slot: 10, components: [{ index: 24, a: 1, b: 0 }] }] },
];

describe("decodeCtfFilm", () => {
  it("reads the flag events and the named positions from one film", () => {
    const chunks = [
      ...aFakePositionFilmWith({ lives: [{ slot: 512, startMs: 1000, endMs: 20_000 }] }),
      aFakeReplicationChunkWith(identityFrames, { index: 9, startMs: 41_000 }),
    ];

    const decoded = decodeCtfFilm(chunks, aFakeCtfMatchStatsWith(), [
      aFakeParsedHighlightEventWith({ eventType: "death", xuid: "0100000000000000", timeMs: 20_000 }),
    ]);

    expect(decoded.flagEvents).toEqual([{ timestampMs: 44_500, kind: "steal", xuid: "0100000000000000", teamId: 0 }]);
    expect(decoded.unresolvedSlots).toEqual([]);
    expect(decoded.positions.tracks.map((track) => track.xuid)).toEqual(["0100000000000000"]);
    expect(decoded.positionsFailure).toBeNull();
  });

  it("keeps the flag events when the film carries no decodable bipeds", () => {
    const chunks = [aFakeReplicationChunkWith(identityFrames, { index: 1, startMs: 41_000 })];

    const decoded = decodeCtfFilm(chunks, aFakeCtfMatchStatsWith(), []);

    expect(decoded.flagEvents).toHaveLength(1);
    expect(decoded.positions.tracks).toEqual([]);
    expect(decoded.positionsFailure).toContain("lists no biped slots");
  });
});
