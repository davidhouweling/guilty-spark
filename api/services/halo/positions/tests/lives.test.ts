import { describe, expect, it } from "vitest";
import { aFakeBipedLifeWith, aFakeBipedPositionWith, aFakeDeathEventWith } from "../fakes/biped-position.fake";
import {
  bestDeathOffset,
  buildLives,
  nameLivesByDeaths,
  nameLivesByElimination,
  nameLivesByRespawnOrder,
} from "../lives";

const A = "0100000000000000";
const B = "0400000000000000";
const C = "0800000000000000";

describe("buildLives", () => {
  it("opens a new life where a slot falls silent for longer than the life gap", () => {
    const positions = [
      aFakeBipedPositionWith({ slot: 512, timestampMs: 1000, q: [1, 2, 3] }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 2000, q: [4, 5, 6] }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 9000, q: [7, 8, 9] }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 9500, q: [10, 11, 12] }),
    ];

    expect(buildLives(positions)).toEqual([
      {
        slot: 512,
        startMs: 1000,
        endMs: 2000,
        xuid: null,
        samples: [
          { timestampMs: 1000, q: [1, 2, 3] },
          { timestampMs: 2000, q: [4, 5, 6] },
        ],
      },
      {
        slot: 512,
        startMs: 9000,
        endMs: 9500,
        xuid: null,
        samples: [
          { timestampMs: 9000, q: [7, 8, 9] },
          { timestampMs: 9500, q: [10, 11, 12] },
        ],
      },
    ]);
  });

  it("keeps a short gap inside one life and orders lives by slot", () => {
    const positions = [
      aFakeBipedPositionWith({ slot: 513, timestampMs: 1000 }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 1000 }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 5000 }),
    ];

    expect(buildLives(positions).map((life) => [life.slot, life.startMs, life.endMs])).toEqual([
      [512, 1000, 5000],
      [513, 1000, 1000],
    ]);
  });

  it("returns no lives without positions", () => {
    expect(buildLives([])).toEqual([]);
  });
});

describe("bestDeathOffset", () => {
  it("returns the centre of the offset plateau that pairs the most deaths", () => {
    const lives = [aFakeBipedLifeWith({ endMs: 10_000 }), aFakeBipedLifeWith({ slot: 513, endMs: 20_000 })];
    const deaths = [
      aFakeDeathEventWith({ timestampMs: 9900, xuid: A }),
      aFakeDeathEventWith({ timestampMs: 19_900, xuid: B }),
    ];

    expect(bestDeathOffset(lives, deaths)).toBe(100);
  });

  it("returns zero without deaths", () => {
    expect(bestDeathOffset([aFakeBipedLifeWith()], [])).toBe(0);
  });
});

describe("nameLivesByDeaths", () => {
  it("names each life after the death that ends it", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 1000, endMs: 10_000 }),
      aFakeBipedLifeWith({ slot: 513, startMs: 1000, endMs: 15_000 }),
      aFakeBipedLifeWith({ slot: 514, startMs: 1000, endMs: 30_000 }),
    ];
    const deaths = [
      aFakeDeathEventWith({ timestampMs: 10_020, xuid: A }),
      aFakeDeathEventWith({ timestampMs: 15_020, xuid: B }),
    ];

    expect(nameLivesByDeaths(lives, deaths).map((life) => life.xuid)).toEqual([A, B, null]);
  });

  it("tells two deaths at the same instant apart by each owner's previous death", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 1000, endMs: 10_000 }),
      aFakeBipedLifeWith({ slot: 513, startMs: 1000, endMs: 15_000 }),
      aFakeBipedLifeWith({ slot: 514, startMs: 12_000, endMs: 40_000 }),
      aFakeBipedLifeWith({ slot: 515, startMs: 20_000, endMs: 40_000 }),
    ];
    const deaths = [
      aFakeDeathEventWith({ timestampMs: 40_000, xuid: B }),
      aFakeDeathEventWith({ timestampMs: 40_000, xuid: A }),
      aFakeDeathEventWith({ timestampMs: 10_000, xuid: A }),
      aFakeDeathEventWith({ timestampMs: 15_000, xuid: B }),
    ];

    expect(nameLivesByDeaths(lives, deaths).map((life) => life.xuid)).toEqual([A, B, A, B]);
  });

  it("leaves lives untouched without deaths", () => {
    const lives = [aFakeBipedLifeWith()];

    expect(nameLivesByDeaths(lives, [])).toEqual(lives);
  });
});

describe("nameLivesByElimination", () => {
  it("names a life when one roster member is unaccounted for throughout its span", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 5000, endMs: 25_000 }),
    ];

    expect(nameLivesByElimination(lives, [A, B]).map((life) => life.xuid)).toEqual([A, B]);
  });

  it("leaves a life unnamed while two roster members are missing", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 5000, endMs: 25_000 }),
    ];

    expect(nameLivesByElimination(lives, [A, B, C]).map((life) => life.xuid)).toEqual([A, null]);
  });

  it("names a life whose owner only becomes certain once another life is named", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 515, startMs: 15_000, endMs: 30_000 }),
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 10_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 0, endMs: 30_000 }),
    ];

    expect(nameLivesByElimination(lives, [A, B, C]).map((life) => life.xuid)).toEqual([B, A, B, C]);
  });

  it("leaves a life unnamed when its decisive instants disagree", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 10_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 20_000, endMs: 30_000, xuid: C }),
      aFakeBipedLifeWith({ slot: 515, startMs: 0, endMs: 30_000 }),
    ];

    expect(nameLivesByElimination(lives, [A, B, C]).map((life) => life.xuid)).toEqual([A, B, C, null]);
  });
});

describe("nameLivesByRespawnOrder", () => {
  it("gives each new life to the player who has been dead the longest", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 15_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 515, startMs: 25_000, endMs: 40_000 }),
      aFakeBipedLifeWith({ slot: 514, startMs: 20_000, endMs: 40_000 }),
    ];

    expect(nameLivesByRespawnOrder(lives, [A, B]).map((life) => life.xuid)).toEqual([A, B, B, A]);
  });

  it("skips a player whose named life overlaps the new one", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 15_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 22_000, endMs: 40_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 515, startMs: 20_000, endMs: 30_000 }),
    ];

    expect(nameLivesByRespawnOrder(lives, [A, B]).map((life) => life.xuid)).toEqual([A, B, A, B]);
  });

  it("leaves a life unnamed when nobody has died before it or the wait is implausible", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 1000 }),
      aFakeBipedLifeWith({ slot: 513, startMs: 2000, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 514, startMs: 50_000, endMs: 60_000 }),
    ];

    expect(nameLivesByRespawnOrder(lives, [A, B]).map((life) => life.xuid)).toEqual([null, A, null]);
  });
});
