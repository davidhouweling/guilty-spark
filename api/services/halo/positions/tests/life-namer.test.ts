import { describe, expect, it } from "vitest";
import { aFakeBipedLifeWith, aFakeDeathEventWith, aFakeRosterMemberWith } from "../fakes/biped-position.fake";
import { LifeNamer } from "../life-namer";
import type { RosterMember } from "../types";

const A = "0100000000000000";
const B = "0400000000000000";
const C = "0800000000000000";
const D = "0900000000000000";
const rosterOf = (...xuids: string[]): RosterMember[] => xuids.map((xuid) => aFakeRosterMemberWith({ xuid }));

describe("LifeNamer.byDeaths", () => {
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

    expect(
      LifeNamer.forMatch(lives, deaths, rosterOf(A, B, C, D))
        .byDeaths(lives)
        .map((life) => life.xuid),
    ).toEqual([A, B, null]);
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

    expect(
      LifeNamer.forMatch(lives, deaths, rosterOf(A, B, C, D))
        .byDeaths(lives)
        .map((life) => life.xuid),
    ).toEqual([A, B, A, B]);
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

    expect(
      LifeNamer.forMatch(lives, deaths, rosterOf(A, B, C, D))
        .byDeaths(lives)
        .map((life) => life.xuid),
    ).toEqual([A, null]);
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

    expect(
      LifeNamer.forMatch(lives, deaths, rosterOf(A, B, C, D))
        .byDeaths(lives)
        .map((life) => life.xuid),
    ).toEqual([null, null, null]);
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

    expect(
      LifeNamer.forMatch(lives, deaths, rosterOf(A, B, C, D))
        .byDeaths(lives)
        .map((life) => life.xuid),
    ).toEqual([null, null, C]);
  });

  it("does not name a life after a player who joined after it began", () => {
    const lives = [aFakeBipedLifeWith({ startMs: 1000, endMs: 40_000 })];
    const deaths = [aFakeDeathEventWith({ timestampMs: 40_000, xuid: B })];
    const roster = [aFakeRosterMemberWith({ xuid: A }), aFakeRosterMemberWith({ xuid: B, presentFromMs: 30_000 })];

    expect(
      LifeNamer.forMatch(lives, deaths, roster)
        .byDeaths(lives)
        .map((life) => life.xuid),
    ).toEqual([null]);
  });

  it("rules a player out before forcing pairs so an impossible pairing cannot settle another", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 1000, endMs: 9900 }),
      aFakeBipedLifeWith({ slot: 513, startMs: 9500, endMs: 10_100 }),
      aFakeBipedLifeWith({ slot: 514, startMs: 1000, endMs: 20_100 }),
    ];
    const deaths = [
      aFakeDeathEventWith({ timestampMs: 10_000, xuid: A }),
      aFakeDeathEventWith({ timestampMs: 10_200, xuid: B }),
      aFakeDeathEventWith({ timestampMs: 20_000, xuid: C }),
    ];
    const roster = [
      aFakeRosterMemberWith({ xuid: A, presentFromMs: 9000 }),
      aFakeRosterMemberWith({ xuid: B }),
      aFakeRosterMemberWith({ xuid: C }),
    ];

    expect(
      LifeNamer.forMatch(lives, deaths, roster)
        .byDeaths(lives)
        .map((life) => life.xuid),
    ).toEqual([null, null, C]);
  });

  it("leaves lives untouched without deaths", () => {
    const lives = [aFakeBipedLifeWith()];

    expect(LifeNamer.forMatch(lives, [], rosterOf(A)).byDeaths(lives)).toEqual(lives);
  });
});

describe("LifeNamer.byElimination", () => {
  it("names a life when one roster member is unaccounted for throughout its span", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 5000, endMs: 25_000 }),
    ];

    expect(new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).byElimination(lives).map((life) => life.xuid)).toEqual(
      [A, B],
    );
  });

  it("leaves a life unnamed while two roster members are missing", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 5000, endMs: 25_000 }),
    ];

    expect(
      new LifeNamer({ deaths: [], roster: rosterOf(A, B, C) }).byElimination(lives).map((life) => life.xuid),
    ).toEqual([A, null]);
  });

  it("names a life whose owner only becomes certain once another life is named", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 515, startMs: 15_000, endMs: 30_000 }),
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 10_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 0, endMs: 30_000 }),
    ];

    expect(
      new LifeNamer({ deaths: [], roster: rosterOf(A, B, C) }).byElimination(lives).map((life) => life.xuid),
    ).toEqual([B, A, B, C]);
  });

  it("leaves a life unnamed when its decisive instants disagree", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 10_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 20_000, endMs: 30_000, xuid: C }),
      aFakeBipedLifeWith({ slot: 515, startMs: 0, endMs: 30_000 }),
    ];

    expect(
      new LifeNamer({ deaths: [], roster: rosterOf(A, B, C) }).byElimination(lives).map((life) => life.xuid),
    ).toEqual([A, B, C, null]);
  });

  it("names only the life that stands alone as the missing player's biped when unnamed lives overlap", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 514, startMs: 10_000, endMs: 20_000 }),
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 5000, endMs: 25_000 }),
    ];

    expect(new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).byElimination(lives).map((life) => life.xuid)).toEqual(
      [null, A, B],
    );
  });

  it("does not give one player two overlapping lives in two slots", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 6000, endMs: 12_000 }),
      aFakeBipedLifeWith({ slot: 514, startMs: 10_000, endMs: 20_000 }),
    ];

    const named = new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).byElimination(lives).map((life) => life.xuid);

    expect(named[0]).toBe(A);
    expect(named.filter((xuid) => xuid === B)).toHaveLength(1);
  });

  it("does not name a life after a player who died less than a respawn before it began", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 60_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 600, startMs: 10_200, endMs: 10_400 }),
    ];

    expect(new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).byElimination(lives).map((life) => life.xuid)).toEqual(
      [A, B, null],
    );
  });

  it("does not name a life after a player whose previous life it named moments earlier in the same pass", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 60_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 10_000 }),
      aFakeBipedLifeWith({ slot: 600, startMs: 10_200, endMs: 10_400 }),
    ];

    expect(new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).byElimination(lives).map((life) => life.xuid)).toEqual(
      [A, B, null],
    );
  });

  it("judges lives earliest first so a later fragment sees the life that ended just before it", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 60_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 10_200, endMs: 10_400 }),
      aFakeBipedLifeWith({ slot: 600, startMs: 0, endMs: 10_000 }),
    ];

    expect(new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).byElimination(lives).map((life) => life.xuid)).toEqual(
      [A, null, B],
    );
  });

  it("reads a death known only from the feed when judging whether a respawn is possible", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 60_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 600, startMs: 10_300, endMs: 12_000 }),
    ];
    const deaths = [aFakeDeathEventWith({ timestampMs: 10_000, xuid: B })];

    expect(
      new LifeNamer({ deaths: deaths, roster: rosterOf(A, B) }).byElimination(lives).map((life) => life.xuid),
    ).toEqual([A, null]);
  });

  it("does not name a fragment after a player whose next life starts within a respawn of it", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 60_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 10_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 20_000, endMs: 60_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 600, startMs: 19_600, endMs: 19_800 }),
    ];

    expect(new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).byElimination(lives).map((life) => life.xuid)).toEqual(
      [A, B, B, null],
    );
  });

  it("does not name a fragment after a player when its slot already belongs to someone else", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 515, startMs: 38_000, endMs: 55_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 30_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 512, startMs: 40_000, endMs: 50_000 }),
    ];

    expect(new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).byElimination(lives).map((life) => life.xuid)).toEqual(
      [A, A, B, null],
    );
    expect(
      new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).byRespawnOrder(lives).map((life) => life.xuid),
    ).toEqual([A, A, B, null]);
  });

  it("does not name a life to a player the feed says died while it was running", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 60_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 25_000, endMs: 45_000 }),
    ];
    const deaths = [aFakeDeathEventWith({ timestampMs: 30_000, xuid: B })];

    expect(
      new LifeNamer({ deaths: deaths, roster: rosterOf(A, B) }).byElimination(lives).map((life) => life.xuid),
    ).toEqual([A, null]);
    expect(
      new LifeNamer({ deaths: deaths, roster: rosterOf(A, B) }).byRespawnOrder(lives).map((life) => life.xuid),
    ).toEqual([A, null]);
  });

  it("does not name a life that began before its only candidate joined", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 60_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 1000, endMs: 60_000 }),
    ];
    const roster = [aFakeRosterMemberWith({ xuid: A }), aFakeRosterMemberWith({ xuid: B, presentFromMs: 30_000 })];

    expect(new LifeNamer({ deaths: [], roster: roster }).byElimination(lives).map((life) => life.xuid)).toEqual([
      A,
      null,
    ]);
  });

  it("does not name a late joiner's first biped after a dead teammate", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 60_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 19_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 21_000, endMs: 24_000 }),
    ];
    const roster = [...rosterOf(A, B), aFakeRosterMemberWith({ xuid: C, presentFromMs: 20_000 })];

    expect(new LifeNamer({ deaths: [], roster: roster }).byElimination(lives).map((life) => life.xuid)).toEqual([
      A,
      B,
      null,
    ]);
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

    expect(new LifeNamer({ deaths: [], roster: roster }).byElimination(lives).map((life) => life.xuid)).toEqual([A, B]);
  });
});

describe("LifeNamer.bySlot", () => {
  it("extends the one name a slot's lives agree on to the slot's unnamed lives", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 1000 }),
      aFakeBipedLifeWith({ slot: 512, startMs: 30_000, endMs: 40_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 1000 }),
      aFakeBipedLifeWith({ slot: 514, startMs: 0, endMs: 1000, xuid: C }),
      aFakeBipedLifeWith({ slot: 514, startMs: 30_000, endMs: 40_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 50_000, endMs: 60_000 }),
    ];

    expect(new LifeNamer({ deaths: [], roster: rosterOf(A, B, C) }).bySlot(lives).map((life) => life.xuid)).toEqual([
      A,
      A,
      null,
      C,
      B,
      null,
    ]);
  });

  it("does not extend one owner onto two overlapping fragments in different slots", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 520, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 521, startMs: 20_000, endMs: 30_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 520, startMs: 40_000, endMs: 50_000 }),
      aFakeBipedLifeWith({ slot: 521, startMs: 45_000, endMs: 55_000 }),
    ];

    expect(new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).bySlot(lives).map((life) => life.xuid)).toEqual([
      A,
      A,
      A,
      null,
    ]);
  });

  it("does not extend a slot's owner onto a fragment within a respawn of the owner's previous life", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 520, startMs: 10_200, endMs: 10_400 }),
      aFakeBipedLifeWith({ slot: 520, startMs: 20_000, endMs: 60_000, xuid: A }),
    ];

    expect(new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).bySlot(lives).map((life) => life.xuid)).toEqual([
      A,
      null,
      A,
    ]);
  });

  it("does not extend a slot's owner onto a fragment within a respawn of a feed-only death", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 520, startMs: 10_200, endMs: 10_400 }),
      aFakeBipedLifeWith({ slot: 520, startMs: 20_000, endMs: 60_000, xuid: A }),
    ];
    const deaths = [aFakeDeathEventWith({ timestampMs: 10_000, xuid: A })];

    expect(new LifeNamer({ deaths: deaths, roster: rosterOf(A, B) }).bySlot(lives).map((life) => life.xuid)).toEqual([
      null,
      A,
    ]);
  });

  it("does not extend a slot's owner onto a life that outlasts the owner's departure", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 520, startMs: 0, endMs: 20_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 520, startMs: 30_000, endMs: 60_000 }),
    ];
    const roster = [aFakeRosterMemberWith({ xuid: A, presentToMs: 40_000 }), aFakeRosterMemberWith({ xuid: B })];

    expect(new LifeNamer({ deaths: [], roster: roster }).bySlot(lives).map((life) => life.xuid)).toEqual([A, null]);
  });

  it("does not extend a slot's owner onto a life before the owner joined", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 520, startMs: 100_000, endMs: 150_000 }),
      aFakeBipedLifeWith({ slot: 520, startMs: 320_000, endMs: 340_000, xuid: B }),
    ];
    const roster = [aFakeRosterMemberWith({ xuid: A }), aFakeRosterMemberWith({ xuid: B, presentFromMs: 300_000 })];

    expect(new LifeNamer({ deaths: [], roster: roster }).bySlot(lives).map((life) => life.xuid)).toEqual([null, B]);
  });

  it("does not extend a slot's owner onto a life that overlaps the owner's other life", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 515, startMs: 38_000, endMs: 55_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 520, startMs: 10_000, endMs: 20_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 520, startMs: 40_000, endMs: 50_000 }),
    ];

    expect(new LifeNamer({ deaths: [], roster: rosterOf(A, B, C) }).bySlot(lives).map((life) => life.xuid)).toEqual([
      A,
      A,
      null,
    ]);
  });
});

describe("LifeNamer.byRespawnOrder", () => {
  it("gives each new life to the player who has been dead the longest", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 15_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 515, startMs: 25_000, endMs: 40_000 }),
      aFakeBipedLifeWith({ slot: 514, startMs: 20_000, endMs: 40_000 }),
    ];

    expect(
      new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).byRespawnOrder(lives).map((life) => life.xuid),
    ).toEqual([A, B, B, A]);
  });

  it("skips a player whose named life overlaps the new one", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 15_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 22_000, endMs: 40_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 515, startMs: 20_000, endMs: 30_000 }),
    ];

    expect(
      new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).byRespawnOrder(lives).map((life) => life.xuid),
    ).toEqual([A, B, A, B]);
  });

  it("leaves a life unnamed when nobody has died before it or the wait is implausible", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 1000 }),
      aFakeBipedLifeWith({ slot: 513, startMs: 2000, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 514, startMs: 50_000, endMs: 60_000 }),
    ];

    expect(
      new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).byRespawnOrder(lives).map((life) => life.xuid),
    ).toEqual([null, A, null]);
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

    expect(
      new LifeNamer({ deaths: deaths, roster: rosterOf(A, B) }).byRespawnOrder(lives).map((life) => life.xuid),
    ).toEqual([A, B, null]);
  });

  it("leaves a life unnamed when two players have been dead for exactly as long", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 10_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 20_000, endMs: 40_000 }),
    ];

    expect(
      new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).byRespawnOrder(lives).map((life) => life.xuid),
    ).toEqual([A, B, null]);
  });

  it("applies a slot's known owner to its unnamed lives before ranking", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 30_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 513, startMs: 37_000, endMs: 60_000 }),
    ];

    expect(
      new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).byRespawnOrder(lives).map((life) => life.xuid),
    ).toEqual([A, B, B]);
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

    expect(
      new LifeNamer({ deaths: deaths, roster: rosterOf(A, B, C) }).byRespawnOrder(lives).map((life) => life.xuid),
    ).toEqual([A, B, null, A, C]);
  });

  it("does not guess while a member who may be present has neither spawned nor died", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 60_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 21_000, endMs: 40_000 }),
    ];
    const roster = [...rosterOf(A, B), aFakeRosterMemberWith({ xuid: C, presentFromMs: 20_000 })];

    expect(new LifeNamer({ deaths: [], roster: roster }).byRespawnOrder(lives).map((life) => life.xuid)).toEqual([
      A,
      B,
      null,
    ]);
  });

  it("names every life of a slot as soon as its first life is named", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 29_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 20_000, endMs: 30_000 }),
      aFakeBipedLifeWith({ slot: 514, startMs: 40_000, endMs: 50_000 }),
    ];

    expect(
      new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).byRespawnOrder(lives).map((life) => life.xuid),
    ).toEqual([A, B, A, A]);
  });

  it("counts a slot's deferred lives as its owner's when ranking later lives", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 31_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 20_000, endMs: 30_000 }),
      aFakeBipedLifeWith({ slot: 514, startMs: 40_000, endMs: 50_000 }),
      aFakeBipedLifeWith({ slot: 515, startMs: 42_000, endMs: 60_000 }),
    ];

    expect(
      new LifeNamer({ deaths: [], roster: rosterOf(A, B) }).byRespawnOrder(lives).map((life) => life.xuid),
    ).toEqual([A, B, A, A, B]);
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

    expect(
      new LifeNamer({ deaths: [], roster: roster }).byRespawnOrder([...lives, cLife]).map((life) => life.xuid),
    ).toEqual([A, B, null, null, C]);
  });

  it("does not hand a respawn to a player who has left the match", () => {
    const lives = [
      aFakeBipedLifeWith({ slot: 512, startMs: 0, endMs: 10_000, xuid: A }),
      aFakeBipedLifeWith({ slot: 513, startMs: 0, endMs: 15_000, xuid: B }),
      aFakeBipedLifeWith({ slot: 514, startMs: 25_000, endMs: 40_000 }),
    ];
    const roster = [aFakeRosterMemberWith({ xuid: A, presentToMs: 10_000 }), aFakeRosterMemberWith({ xuid: B })];

    expect(new LifeNamer({ deaths: [], roster: roster }).byRespawnOrder(lives).map((life) => life.xuid)).toEqual([
      A,
      B,
      B,
    ]);
  });
});
