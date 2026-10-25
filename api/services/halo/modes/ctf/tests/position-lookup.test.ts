import { describe, expect, it } from "vitest";
import { aFakePlayerPositionsWith, aFakeStraightLifeWith } from "../../../positions/fakes/player-positions.fake";
import { PositionLookup, POSITION_TOLERANCE_MS } from "../position-lookup";

const A = "0100000000000000";

describe("PositionLookup", () => {
  const lookup = new PositionLookup(
    aFakePlayerPositionsWith({
      tracks: [
        {
          xuid: A,
          teamId: 0,
          lives: [
            aFakeStraightLifeWith({
              slot: 512,
              startMs: 1000,
              endMs: 3000,
              from: [0, 0, 0],
              to: [4000, 0, 0],
              xuid: A,
            }),
            aFakeStraightLifeWith({
              slot: 520,
              startMs: 13_000,
              endMs: 14_000,
              from: [9000, 0, 0],
              to: [9000, 0, 0],
              xuid: A,
            }),
          ],
        },
      ],
    }),
  );

  it("returns the nearest sample across a player's lives", () => {
    expect(lookup.positionAt(A, 2100)).toEqual([2000, 0, 0]);
    expect(lookup.positionAt(A, 13_400)).toEqual([9000, 0, 0]);
  });

  it("returns nothing when the nearest sample is further than the tolerance", () => {
    expect(lookup.positionAt(A, 3000 + POSITION_TOLERANCE_MS)).toEqual([4000, 0, 0]);
    expect(lookup.positionAt(A, 3000 + POSITION_TOLERANCE_MS + 1)).toBeNull();
  });

  it("returns nothing for a player without a track", () => {
    expect(lookup.positionAt("0400000000000000", 2000)).toBeNull();
  });
});
