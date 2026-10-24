import { describe, expect, it } from "vitest";
import {
  aFakeBipedLifeWith,
  aFakeBipedPositionWith,
  aFakeDeathEventWith,
  aFakeRosterMemberWith,
} from "../fakes/biped-position.fake";
import {
  alignDeathsToFilm,
  bestDeathOffset,
  buildLives,
  nameLivesByDeaths,
  nameLivesByElimination,
  nameLivesByRespawnOrder,
  nameLivesBySlot,
} from "../lives";
import type { RosterMember } from "../types";

const A = "0100000000000000";
const B = "0400000000000000";
const C = "0800000000000000";
const rosterOf = (...xuids: string[]): RosterMember[] => xuids.map((xuid) => aFakeRosterMemberWith({ xuid }));

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

describe("alignDeathsToFilm", () => {
  it("moves the death feed onto the film clock by the given offset", () => {
    const deaths = [aFakeDeathEventWith({ timestampMs: 9900, xuid: A })];

    expect(alignDeathsToFilm(deaths, 100)).toEqual([aFakeDeathEventWith({ timestampMs: 10_000, xuid: A })]);
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

  it("settles two deaths at the same instant when a previous death leaves one of them a single option", () => {
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

  it("does not pair a death with a life that began before the owner's previous death", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 1000, endMs: 10_000 }),
      aFakeBipedLifeWith({ slot: 513, startMs: 5000, endMs: 20_000 }),
    ];
    const deaths = [
      aFakeDeathEventWith({ timestampMs: 10_000, xuid: A }),
      aFakeDeathEventWith({ timestampMs: 20_000, xuid: A }),
    ];

    expect(nameLivesByDeaths(lives, deaths).map((life) => life.xuid)).toEqual([A, null]);
  });

  it("leaves two deaths at the same instant unnamed when nothing tells them apart", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 1000, endMs: 10_000 }),
      aFakeBipedLifeWith({ slot: 513, startMs: 1000, endMs: 10_050 }),
      aFakeBipedLifeWith({ slot: 514, startMs: 1000, endMs: 20_000 }),
    ];
    const deaths = [
      aFakeDeathEventWith({ timestampMs: 10_000, xuid: A }),
      aFakeDeathEventWith({ timestampMs: 10_000, xuid: B }),
      aFakeDeathEventWith({ timestampMs: 20_000, xuid: C }),
    ];

    expect(nameLivesByDeaths(lives, deaths).map((life) => life.xuid)).toEqual([null, null, C]);
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

    expect(nameLivesByElimination(lives, rosterOf(A, B)).map((life) => life.xuid)).toEqual([A, B]);
  });

  it("leaves a life unnamed while two roster members are missing", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 5000, endMs: 25_000 }),
    ];

    expect(nameLivesByElimination(lives, rosterOf(A, B, C)).map((life) => life.xuid)).toEqual([A, null]);
  });

  it("names a life whose owner only becomes certain once another life is named", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 515, startMs: 15_000, endMs: 30_000 }),
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 10_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 0, endMs: 30_000 }),
    ];

    expect(nameLivesByElimination(lives, rosterOf(A, B, C)).map((life) => life.xuid)).toEqual([B, A, B, C]);
  });

  it("leaves a life unnamed when its decisive instants disagree", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 10_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 20_000, endMs: 30_000, xuid: C }),
      aFakeBipedLifeWith({ slot: 515, startMs: 0, endMs: 30_000 }),
    ];

    expect(nameLivesByElimination(lives, rosterOf(A, B, C)).map((life) => life.xuid)).toEqual([A, B, C, null]);
  });

  it("names only the life that stands alone as the missing player's biped when unnamed lives overlap", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 514, startMs: 10_000, endMs: 20_000 }),
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 5000, endMs: 25_000 }),
    ];

    expect(nameLivesByElimination(lives, rosterOf(A, B)).map((life) => life.xuid)).toEqual([null, A, B]);
  });

  it("does not name a late joiner's first biped after a dead teammate", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 60_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 19_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 21_000, endMs: 24_000 }),
    ];
    const roster = [...rosterOf(A, B), aFakeRosterMemberWith({ xuid: C, presentFromMs: 20_000 })];

    expect(nameLivesByElimination(lives, roster).map((life) => life.xuid)).toEqual([A, B, null]);
  });

  it("does not expect a biped from a player outside their participation window", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 60_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 20_000, endMs: 60_000 }),
    ];
    const roster = [
      aFakeRosterMemberWith({ xuid: A }),
      aFakeRosterMemberWith({ xuid: B }),
      aFakeRosterMemberWith({ xuid: C, presentToMs: 10_000 }),
    ];

    expect(nameLivesByElimination(lives, roster).map((life) => life.xuid)).toEqual([A, B]);
  });
});

describe("nameLivesBySlot", () => {
  it("extends the one name a slot's lives agree on to the slot's unnamed lives", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 1000 }),
      aFakeBipedLifeWith({ slot: 512, startMs: 30_000, endMs: 40_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 1000 }),
      aFakeBipedLifeWith({ slot: 514, startMs: 0, endMs: 1000, xuid: A }),
      aFakeBipedLifeWith({ slot: 514, startMs: 30_000, endMs: 40_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 50_000, endMs: 60_000 }),
    ];

    expect(nameLivesBySlot(lives).map((life) => life.xuid)).toEqual([A, A, null, A, B, null]);
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

    expect(nameLivesByRespawnOrder(lives, [], rosterOf(A, B)).map((life) => life.xuid)).toEqual([A, B, B, A]);
  });

  it("skips a player whose named life overlaps the new one", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 15_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 22_000, endMs: 40_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 515, startMs: 20_000, endMs: 30_000 }),
    ];

    expect(nameLivesByRespawnOrder(lives, [], rosterOf(A, B)).map((life) => life.xuid)).toEqual([A, B, A, B]);
  });

  it("leaves a life unnamed when nobody has died before it or the wait is implausible", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 1000 }),
      aFakeBipedLifeWith({ slot: 513, startMs: 2000, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 514, startMs: 50_000, endMs: 60_000 }),
    ];

    expect(nameLivesByRespawnOrder(lives, [], rosterOf(A, B)).map((life) => life.xuid)).toEqual([null, A, null]);
  });

  it("leaves a life unnamed when two players have been dead for exactly as long", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 10_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 20_000, endMs: 40_000 }),
    ];

    expect(nameLivesByRespawnOrder(lives, [], rosterOf(A, B)).map((life) => life.xuid)).toEqual([A, B, null]);
  });

  it("leaves a life in an owned slot to the slot pass", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 30_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 513, startMs: 37_000, endMs: 60_000 }),
    ];

    expect(nameLivesByRespawnOrder(lives, [], rosterOf(A, B)).map((life) => life.xuid)).toEqual([A, B, null]);
  });

  it("counts a player's unmatched death from the death feed when ranking who has waited longest", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 15_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 0, endMs: 12_000 }),
      aFakeBipedLifeWith({ slot: 515, startMs: 17_000, endMs: 40_000 }),
      aFakeBipedLifeWith({ slot: 516, startMs: 20_000, endMs: 40_000 }),
    ];
    const deaths = [aFakeDeathEventWith({ timestampMs: 12_000, xuid: C })];

    expect(nameLivesByRespawnOrder(lives, deaths, rosterOf(A, B, C)).map((life) => life.xuid)).toEqual([
      A,
      B,
      null,
      A,
      C,
    ]);
  });

  it("does not guess while a member who may be present has neither spawned nor died", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 60_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 21_000, endMs: 40_000 }),
    ];
    const roster = [...rosterOf(A, B), aFakeRosterMemberWith({ xuid: C, presentFromMs: 20_000 })];

    expect(nameLivesByRespawnOrder(lives, [], roster).map((life) => life.xuid)).toEqual([A, B, null]);
  });

  it("leaves later lives of a slot it has just named to the slot pass", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 29_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 20_000, endMs: 30_000 }),
      aFakeBipedLifeWith({ slot: 514, startMs: 40_000, endMs: 50_000 }),
    ];

    expect(nameLivesByRespawnOrder(lives, [], rosterOf(A, B)).map((life) => life.xuid)).toEqual([A, B, A, null]);
  });

  it("does not hand a respawn to a player who has left the match", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 15_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 25_000, endMs: 40_000 }),
    ];
    const roster = [aFakeRosterMemberWith({ xuid: A, presentToMs: 10_000 }), aFakeRosterMemberWith({ xuid: B })];

    expect(nameLivesByRespawnOrder(lives, [], roster).map((life) => life.xuid)).toEqual([A, B, B]);
  });
});
