import { describe, expect, it } from "vitest";
import {
  aFakeBipedLifeWith,
  aFakeBipedPositionWith,
  aFakeDeathEventWith,
  aFakeRosterMemberWith,
} from "../fakes/biped-position.fake";
import {
  alignDeathsToFilm,
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

  it("drops a life made of a single sample", () => {
    const positions = [
      aFakeBipedPositionWith({ slot: 512, timestampMs: 1000 }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 1100 }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 9000 }),
    ];

    expect(buildLives(positions).map((life) => [life.startMs, life.endMs])).toEqual([[1000, 1100]]);
  });

  it("keeps a short gap inside one life and orders lives by slot", () => {
    const positions = [
      aFakeBipedPositionWith({ slot: 513, timestampMs: 1000 }),
      aFakeBipedPositionWith({ slot: 513, timestampMs: 1100 }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 1000 }),
      aFakeBipedPositionWith({ slot: 512, timestampMs: 5000 }),
    ];

    expect(buildLives(positions).map((life) => [life.slot, life.startMs, life.endMs])).toEqual([
      [512, 1000, 5000],
      [513, 1000, 1100],
    ]);
  });

  it("returns no lives without positions", () => {
    expect(buildLives([])).toEqual([]);
  });
});

describe("nameLivesByDeaths offset", () => {
  it("returns the centre of the offset plateau that pairs the most deaths", () => {
    const lives = [aFakeBipedLifeWith({ endMs: 10_000 }), aFakeBipedLifeWith({ slot: 513, endMs: 20_000 })];
    const deaths = [
      aFakeDeathEventWith({ timestampMs: 9900, xuid: A }),
      aFakeDeathEventWith({ timestampMs: 19_900, xuid: B }),
    ];

    expect(nameLivesByDeaths(lives, deaths).offsetMs).toBe(100);
  });

  it("counts each death once so a cluster of lives cannot pull the offset", () => {
    const lives = [
      ...[...Array(8).keys()].map((index) => aFakeBipedLifeWith({ slot: 600 + index, endMs: 10_500 + index * 10 })),
      ...[20_000, 30_000, 40_000, 50_000, 60_000, 70_000].map((endMs, index) =>
        aFakeBipedLifeWith({ slot: 700 + index, endMs }),
      ),
    ];
    const deaths = [10_000, 20_000, 30_000, 40_000, 50_000, 60_000, 70_000].map((timestampMs, index) =>
      aFakeDeathEventWith({ timestampMs, xuid: `0${String(index + 1)}00000000000000` }),
    );

    expect(nameLivesByDeaths(lives, deaths).offsetMs).toBe(0);
  });

  it("scores an offset by its largest one-to-one matching, not by nearest-first picks", () => {
    const lives = [9900, 10_100, 20_000, 30_000].map((endMs, index) =>
      aFakeBipedLifeWith({ slot: 512 + index, startMs: 1000, endMs }),
    );
    const deaths = [
      aFakeDeathEventWith({ timestampMs: 10_050, xuid: A }),
      aFakeDeathEventWith({ timestampMs: 10_200, xuid: B }),
      aFakeDeathEventWith({ timestampMs: 19_850, xuid: C }),
      aFakeDeathEventWith({ timestampMs: 29_850, xuid: "0900000000000000" }),
    ];

    const named = nameLivesByDeaths(lives, deaths);

    expect(named.offsetMs).toBe(0);
    expect(named.lives.map((life) => life.xuid)).toEqual([A, B, C, "0900000000000000"]);
  });

  it("claims no alignment when two separate offsets fit the feed equally well", () => {
    const lives = [aFakeBipedLifeWith({ startMs: 1000, endMs: 10_000 })];
    const deaths = [
      aFakeDeathEventWith({ timestampMs: 9000, xuid: A }),
      aFakeDeathEventWith({ timestampMs: 11_000, xuid: B }),
    ];

    const named = nameLivesByDeaths(lives, deaths);

    expect(named.offsetMs).toBeNull();
    expect(named.lives.map((life) => life.xuid)).toEqual([null]);
  });

  it("claims no alignment without deaths", () => {
    expect(nameLivesByDeaths([aFakeBipedLifeWith()], []).offsetMs).toBeNull();
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

    expect(nameLivesByDeaths(lives, deaths).lives.map((life) => life.xuid)).toEqual([A, B, null]);
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

    expect(nameLivesByDeaths(lives, deaths).lives.map((life) => life.xuid)).toEqual([A, B, A, B]);
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

    expect(nameLivesByDeaths(lives, deaths).lives.map((life) => life.xuid)).toEqual([A, null]);
  });

  it("settles only pairs that belong to every maximum matching", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 1000, endMs: 9900 }),
      aFakeBipedLifeWith({ slot: 513, startMs: 1000, endMs: 10_100 }),
      aFakeBipedLifeWith({ slot: 514, startMs: 1000, endMs: 10_300 }),
    ];
    const deaths = [
      aFakeDeathEventWith({ timestampMs: 10_000, xuid: A }),
      aFakeDeathEventWith({ timestampMs: 10_200, xuid: B }),
    ];

    expect(nameLivesByDeaths(lives, deaths).lives.map((life) => life.xuid)).toEqual([null, null, null]);
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

    expect(nameLivesByDeaths(lives, deaths).lives.map((life) => life.xuid)).toEqual([null, null, C]);
  });

  it("leaves lives untouched without deaths", () => {
    const lives = [aFakeBipedLifeWith()];

    expect(nameLivesByDeaths(lives, []).lives).toEqual(lives);
  });
});

describe("nameLivesByElimination", () => {
  it("names a life when one roster member is unaccounted for throughout its span", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 5000, endMs: 25_000 }),
    ];

    expect(nameLivesByElimination(lives, [], rosterOf(A, B)).map((life) => life.xuid)).toEqual([A, B]);
  });

  it("leaves a life unnamed while two roster members are missing", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 5000, endMs: 25_000 }),
    ];

    expect(nameLivesByElimination(lives, [], rosterOf(A, B, C)).map((life) => life.xuid)).toEqual([A, null]);
  });

  it("names a life whose owner only becomes certain once another life is named", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 515, startMs: 15_000, endMs: 30_000 }),
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 10_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 0, endMs: 30_000 }),
    ];

    expect(nameLivesByElimination(lives, [], rosterOf(A, B, C)).map((life) => life.xuid)).toEqual([B, A, B, C]);
  });

  it("leaves a life unnamed when its decisive instants disagree", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 10_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 20_000, endMs: 30_000, xuid: C }),
      aFakeBipedLifeWith({ slot: 515, startMs: 0, endMs: 30_000 }),
    ];

    expect(nameLivesByElimination(lives, [], rosterOf(A, B, C)).map((life) => life.xuid)).toEqual([A, B, C, null]);
  });

  it("names only the life that stands alone as the missing player's biped when unnamed lives overlap", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 514, startMs: 10_000, endMs: 20_000 }),
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 5000, endMs: 25_000 }),
    ];

    expect(nameLivesByElimination(lives, [], rosterOf(A, B)).map((life) => life.xuid)).toEqual([null, A, B]);
  });

  it("does not give one player two overlapping lives in two slots", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 6000, endMs: 12_000 }),
      aFakeBipedLifeWith({ slot: 514, startMs: 10_000, endMs: 20_000 }),
    ];

    const named = nameLivesByElimination(lives, [], rosterOf(A, B)).map((life) => life.xuid);

    expect(named[0]).toBe(A);
    expect(named.filter((xuid) => xuid === B)).toHaveLength(1);
  });

  it("does not name a life after a player who died less than a respawn before it began", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 60_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 600, startMs: 10_200, endMs: 10_400 }),
    ];

    expect(nameLivesByElimination(lives, [], rosterOf(A, B)).map((life) => life.xuid)).toEqual([A, B, null]);
  });

  it("does not name a life after a player whose previous life it named moments earlier in the same pass", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 60_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 10_000 }),
      aFakeBipedLifeWith({ slot: 600, startMs: 10_200, endMs: 10_400 }),
    ];

    expect(nameLivesByElimination(lives, [], rosterOf(A, B)).map((life) => life.xuid)).toEqual([A, B, null]);
  });

  it("reads a death known only from the feed when judging whether a respawn is possible", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 60_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 600, startMs: 10_300, endMs: 12_000 }),
    ];
    const deaths = [aFakeDeathEventWith({ timestampMs: 10_000, xuid: B })];

    expect(nameLivesByElimination(lives, deaths, rosterOf(A, B)).map((life) => life.xuid)).toEqual([A, null]);
  });

  it("does not name a life that began before its only candidate joined", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 60_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 1000, endMs: 60_000 }),
    ];
    const roster = [aFakeRosterMemberWith({ xuid: A }), aFakeRosterMemberWith({ xuid: B, presentFromMs: 30_000 })];

    expect(nameLivesByElimination(lives, [], roster).map((life) => life.xuid)).toEqual([A, null]);
  });

  it("does not name a late joiner's first biped after a dead teammate", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 60_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 19_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 21_000, endMs: 24_000 }),
    ];
    const roster = [...rosterOf(A, B), aFakeRosterMemberWith({ xuid: C, presentFromMs: 20_000 })];

    expect(nameLivesByElimination(lives, [], roster).map((life) => life.xuid)).toEqual([A, B, null]);
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

    expect(nameLivesByElimination(lives, [], roster).map((life) => life.xuid)).toEqual([A, B]);
  });
});

describe("nameLivesBySlot", () => {
  it("extends the one name a slot's lives agree on to the slot's unnamed lives", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 1000 }),
      aFakeBipedLifeWith({ slot: 512, startMs: 30_000, endMs: 40_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 1000 }),
      aFakeBipedLifeWith({ slot: 514, startMs: 0, endMs: 1000, xuid: C }),
      aFakeBipedLifeWith({ slot: 514, startMs: 30_000, endMs: 40_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 50_000, endMs: 60_000 }),
    ];

    expect(nameLivesBySlot(lives, rosterOf(A, B, C)).map((life) => life.xuid)).toEqual([A, A, null, C, B, null]);
  });

  it("does not extend one owner onto two overlapping fragments in different slots", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 520, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 521, startMs: 20_000, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 520, startMs: 40_000, endMs: 50_000 }),
      aFakeBipedLifeWith({ slot: 521, startMs: 45_000, endMs: 55_000 }),
    ];

    expect(nameLivesBySlot(lives, rosterOf(A, B)).map((life) => life.xuid)).toEqual([A, A, A, null]);
  });

  it("does not extend a slot's owner onto a life before the owner joined", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 520, startMs: 100_000, endMs: 150_000 }),
      aFakeBipedLifeWith({ slot: 520, startMs: 320_000, endMs: 340_000, xuid: B }),
    ];
    const roster = [aFakeRosterMemberWith({ xuid: A }), aFakeRosterMemberWith({ xuid: B, presentFromMs: 300_000 })];

    expect(nameLivesBySlot(lives, roster).map((life) => life.xuid)).toEqual([null, B]);
  });

  it("does not extend a slot's owner onto a life that overlaps the owner's other life", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 515, startMs: 38_000, endMs: 55_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 520, startMs: 10_000, endMs: 20_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 520, startMs: 40_000, endMs: 50_000 }),
    ];

    expect(nameLivesBySlot(lives, rosterOf(A, B, C)).map((life) => life.xuid)).toEqual([A, A, null]);
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

  it("keeps a simultaneous-death tie when the sampled life ends differ by a few frames", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 10_050, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 20_000, endMs: 40_000 }),
    ];
    const deaths = [
      aFakeDeathEventWith({ timestampMs: 10_000, xuid: A }),
      aFakeDeathEventWith({ timestampMs: 10_000, xuid: B }),
    ];

    expect(nameLivesByRespawnOrder(lives, deaths, rosterOf(A, B)).map((life) => life.xuid)).toEqual([A, B, null]);
  });

  it("leaves a life unnamed when two players have been dead for exactly as long", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 10_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 20_000, endMs: 40_000 }),
    ];

    expect(nameLivesByRespawnOrder(lives, [], rosterOf(A, B)).map((life) => life.xuid)).toEqual([A, B, null]);
  });

  it("applies a slot's known owner to its unnamed lives before ranking", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 30_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 513, startMs: 37_000, endMs: 60_000 }),
    ];

    expect(nameLivesByRespawnOrder(lives, [], rosterOf(A, B)).map((life) => life.xuid)).toEqual([A, B, B]);
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

  it("names every life of a slot as soon as its first life is named", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 29_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 20_000, endMs: 30_000 }),
      aFakeBipedLifeWith({ slot: 514, startMs: 40_000, endMs: 50_000 }),
    ];

    expect(nameLivesByRespawnOrder(lives, [], rosterOf(A, B)).map((life) => life.xuid)).toEqual([A, B, A, A]);
  });

  it("counts a slot's deferred lives as its owner's when ranking later lives", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 31_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 20_000, endMs: 30_000 }),
      aFakeBipedLifeWith({ slot: 514, startMs: 40_000, endMs: 50_000 }),
      aFakeBipedLifeWith({ slot: 515, startMs: 42_000, endMs: 60_000 }),
    ];

    expect(nameLivesByRespawnOrder(lives, [], rosterOf(A, B)).map((life) => life.xuid)).toEqual([A, B, A, A, B]);
  });

  it("does not guess while an unnamed life is still open at the start", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 12_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 20_000, endMs: 40_000 }),
      aFakeBipedLifeWith({ slot: 515, startMs: 25_000, endMs: 40_000 }),
    ];
    const roster = [...rosterOf(A, B), aFakeRosterMemberWith({ xuid: C, presentFromMs: 20_000 })];
    const cLife = aFakeBipedLifeWith({ slot: 516, startMs: 22_000, endMs: 40_000, xuid: C });

    expect(nameLivesByRespawnOrder([...lives, cLife], [], roster).map((life) => life.xuid)).toEqual([
      A,
      B,
      null,
      null,
      C,
    ]);
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
