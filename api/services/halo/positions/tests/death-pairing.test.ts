import { describe, expect, it } from "vitest";
import { alignDeathsToFilm, measureDeathAlignment } from "../death-pairing";
import { aFakeBipedLifeWith, aFakeDeathEventWith, aFakeRosterMemberWith } from "../fakes/biped-position.fake";
import type { RosterMember } from "../types";

const A = "0100000000000000";
const B = "0400000000000000";
const C = "0800000000000000";
const D = "0900000000000000";
const rosterOf = (...xuids: string[]): RosterMember[] => xuids.map((xuid) => aFakeRosterMemberWith({ xuid }));

describe("measureDeathAlignment", () => {
  it("returns the centre of the offset plateau that pairs the most deaths", () => {
    const lives = [aFakeBipedLifeWith({ endMs: 10_000 }), aFakeBipedLifeWith({ slot: 513, endMs: 20_000 })];
    const deaths = [
      aFakeDeathEventWith({ timestampMs: 9900, xuid: A }),
      aFakeDeathEventWith({ timestampMs: 19_900, xuid: B }),
    ];

    expect(measureDeathAlignment(lives, deaths, rosterOf(A, B, C, D)).offsetMs).toBe(100);
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
    const roster = rosterOf(...deaths.map((death) => death.xuid));

    expect(measureDeathAlignment(lives, deaths, roster).offsetMs).toBe(0);
  });

  it("scores an offset by its largest one-to-one matching, not by nearest-first picks", () => {
    const lives = [9900, 10_100, 20_000, 30_000].map((endMs, index) =>
      aFakeBipedLifeWith({ slot: 512 + index, startMs: 1000, endMs }),
    );
    const deaths = [
      aFakeDeathEventWith({ timestampMs: 10_050, xuid: A }),
      aFakeDeathEventWith({ timestampMs: 10_200, xuid: B }),
      aFakeDeathEventWith({ timestampMs: 19_850, xuid: C }),
      aFakeDeathEventWith({ timestampMs: 29_850, xuid: D }),
    ];

    const alignment = measureDeathAlignment(lives, deaths, rosterOf(A, B, C, D));

    expect(alignment.offsetMs).toBe(0);
    expect(alignment.pairings.map((pair) => pair.lifeIndex)).toEqual([0, 1, 2, 3]);
  });

  it("names nothing when the optimal plateau supports different owners at different offsets", () => {
    const lives = [aFakeBipedLifeWith({ startMs: 1000, endMs: 10_000 })];
    const deaths = [
      aFakeDeathEventWith({ timestampMs: 9720, xuid: A }),
      aFakeDeathEventWith({ timestampMs: 10_000, xuid: B }),
      aFakeDeathEventWith({ timestampMs: 10_280, xuid: C }),
    ];

    expect(measureDeathAlignment(lives, deaths, rosterOf(A, B, C, D)).pairings).toEqual([]);
  });

  it("claims no alignment when two separate offsets fit the feed equally well", () => {
    const lives = [aFakeBipedLifeWith({ startMs: 1000, endMs: 10_000 })];
    const deaths = [
      aFakeDeathEventWith({ timestampMs: 9000, xuid: A }),
      aFakeDeathEventWith({ timestampMs: 11_000, xuid: B }),
    ];

    const alignment = measureDeathAlignment(lives, deaths, rosterOf(A, B, C, D));

    expect(alignment.offsetMs).toBeNull();
    expect(alignment.pairings).toEqual([]);
  });

  it("claims no alignment without deaths", () => {
    expect(measureDeathAlignment([aFakeBipedLifeWith()], [], rosterOf(A)).offsetMs).toBeNull();
  });
});

describe("alignDeathsToFilm", () => {
  it("moves the death feed onto the film clock by the given offset", () => {
    const deaths = [aFakeDeathEventWith({ timestampMs: 9900, xuid: A })];

    expect(alignDeathsToFilm(deaths, 100)).toEqual([aFakeDeathEventWith({ timestampMs: 10_000, xuid: A })]);
  });
});
