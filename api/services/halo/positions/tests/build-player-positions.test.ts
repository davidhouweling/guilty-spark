import { describe, expect, it } from "vitest";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import { aFakeCtfMatchStatsWith } from "../../statborg/fakes/ctf-match-stats.fake";
import { aFakeReplicationChunkWith } from "../../statborg/fakes/replication-chunk.fake";
import { buildPlayerPositions, PositionDecodeError, scanChunkPositions } from "../build-player-positions";
import { aFakeDeathEventWith } from "../fakes/biped-position.fake";
import {
  aFakeBipedFrameChunkWith,
  aFakePositionFilmWith,
  FAKE_AXIS_LAYOUT,
  FAKE_ORIGIN,
  walkPosition,
} from "../fakes/position-film.fake";
import type { LifeSpec } from "../fakes/position-film.fake";

describe("scanChunkPositions", () => {
  it("dates each sample from the chunk start plus the film time elapsed since its first frame", () => {
    const chunk = aFakeBipedFrameChunkWith(
      [
        { timestampUs: 1_000_000n, records: [{ slot: 512, q: [12_000, 12_000, 70_000] }] },
        { timestampUs: 1_100_000n, records: [{ slot: 512, q: [12_001, 12_000, 70_000] }] },
      ],
      FAKE_AXIS_LAYOUT,
      { startMs: 5000 },
    );

    expect(scanChunkPositions(chunk, new Set([512]), FAKE_AXIS_LAYOUT)).toEqual([
      { slot: 512, timestampMs: 5000, timestampUs: 1_000_000n, q: [12_000, 12_000, 70_000] },
      { slot: 512, timestampMs: 5100, timestampUs: 1_100_000n, q: [12_001, 12_000, 70_000] },
    ]);
  });

  it("pins the chunk start to the earliest frame when frames arrive out of clock order", () => {
    const chunk = aFakeBipedFrameChunkWith(
      [
        { timestampUs: 1_200_000n, records: [{ slot: 512, q: [12_002, 12_000, 70_000] }] },
        { timestampUs: 1_000_000n, records: [{ slot: 512, q: [12_000, 12_000, 70_000] }] },
      ],
      FAKE_AXIS_LAYOUT,
      { startMs: 5000 },
    );

    expect(scanChunkPositions(chunk, new Set([512]), FAKE_AXIS_LAYOUT).map((position) => position.timestampMs)).toEqual(
      [5200, 5000],
    );
  });

  it("returns nothing for a chunk without frames", () => {
    expect(scanChunkPositions(aFakeBipedFrameChunkWith([]), new Set([512]), FAKE_AXIS_LAYOUT)).toEqual([]);
  });
});

describe("buildPlayerPositions", () => {
  // every player dies once at a distinct instant and respawns ten seconds later into a new slot
  function aRosterFilm(): { lives: LifeSpec[]; deaths: { timestampMs: number; xuid: string }[]; xuids: string[] } {
    const matchStats = aFakeCtfMatchStatsWith();
    const xuids = matchStats.Players.map((player) => unwrapXuid(player.PlayerId));
    const lives: LifeSpec[] = [];
    const deaths: { timestampMs: number; xuid: string }[] = [];
    for (const [index, xuid] of xuids.entries()) {
      const deathMs = 10_000 + index * 2000;
      lives.push({ slot: 512 + index, startMs: 1000, endMs: deathMs });
      lives.push({ slot: 520 + index, startMs: deathMs + 10_000, endMs: 60_000 });
      deaths.push(aFakeDeathEventWith({ timestampMs: deathMs, xuid }));
    }
    return { lives, deaths, xuids };
  }

  it("decodes the layout and names every life of every roster member", () => {
    const { lives, deaths, xuids } = aRosterFilm();
    const matchStats = aFakeCtfMatchStatsWith();

    const positions = buildPlayerPositions(aFakePositionFilmWith({ lives }), matchStats, deaths);

    expect(positions.layout).toEqual(FAKE_AXIS_LAYOUT);
    expect(positions.unnamedLives).toEqual([]);
    expect(positions.tracks.map((track) => track.xuid)).toEqual([...xuids].sort((a, b) => a.localeCompare(b)));
    for (const [index, xuid] of xuids.entries()) {
      const track = positions.tracks.find((candidate) => candidate.xuid === xuid);
      const player = matchStats.Players.find((candidate) => unwrapXuid(candidate.PlayerId) === xuid);
      expect(track?.teamId).toBe(player?.LastTeamId);
      expect(track?.lives.map((life) => [life.slot, life.startMs, life.endMs])).toEqual([
        [512 + index, 1000, 10_000 + index * 2000],
        [520 + index, 20_000 + index * 2000, 60_000],
      ]);
    }
  });

  it("keeps the decoded quanta on each life's samples", () => {
    const { lives, deaths } = aRosterFilm();

    const positions = buildPlayerPositions(aFakePositionFilmWith({ lives }), aFakeCtfMatchStatsWith(), deaths);

    const firstLife = positions.tracks.flatMap((track) => track.lives).find((life) => life.slot === 512);
    expect(firstLife?.samples.slice(0, 2)).toEqual([
      { timestampMs: 1000, q: walkPosition(FAKE_ORIGIN, 512, 0) },
      { timestampMs: 1100, q: walkPosition(FAKE_ORIGIN, 512, 1) },
    ]);
  });

  it("reports lives it cannot name without claiming them for anyone", () => {
    const { lives, xuids } = aRosterFilm();

    const positions = buildPlayerPositions(aFakePositionFilmWith({ lives }), aFakeCtfMatchStatsWith(), []);

    expect(positions.tracks).toEqual([]);
    expect(positions.unnamedLives).toHaveLength(xuids.length * 2);
  });

  it("ignores deaths of players outside the roster", () => {
    const { lives, deaths, xuids } = aRosterFilm();
    const foreign = aFakeDeathEventWith({ timestampMs: 10_000, xuid: "9900000000000000" });

    const positions = buildPlayerPositions(aFakePositionFilmWith({ lives }), aFakeCtfMatchStatsWith(), [
      foreign,
      ...deaths,
    ]);

    expect(positions.unnamedLives).toEqual([]);
    expect(positions.tracks.flatMap((track) => track.lives)).toHaveLength(xuids.length * 2);
  });

  it("throws when the film has no replication chunks", () => {
    expect(() => buildPlayerPositions([], aFakeCtfMatchStatsWith(), [])).toThrow("has no replication chunks");
  });

  it("throws when a replication chunk is empty", () => {
    const chunks = [
      ...aFakePositionFilmWith({ lives: [{ slot: 512, startMs: 1000, endMs: 5000 }] }),
      { index: 2, startMs: 21_000, durationMs: 20_000, data: new Uint8Array(0) },
    ];

    expect(() => buildPlayerPositions(chunks, aFakeCtfMatchStatsWith(), [])).toThrow(
      "has an empty replication chunk: 2",
    );
  });

  it("throws when the film lists no biped slots", () => {
    const chunks = [aFakeReplicationChunkWith([{ timestampUs: 1_000_000n, records: [] }])];

    expect(() => buildPlayerPositions(chunks, aFakeCtfMatchStatsWith(), [])).toThrow(PositionDecodeError);
  });
});
