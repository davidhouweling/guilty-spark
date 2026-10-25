import { describe, expect, it } from "vitest";
import { aFakeDeathEventWith } from "../../../positions/fakes/biped-position.fake";
import { aFakePlayerPositionsWith, aFakeStraightLifeWith } from "../../../positions/fakes/player-positions.fake";
import type { Quantum3 } from "../../../positions/types";
import { aFakeCtfFlagEventWith } from "../../../statborg/fakes/ctf-flag-event.fake";
import { FlagAxis } from "../flag-axis";
import { CARRIER_LOST_MS, OpenRun } from "../open-run";
import { PositionLookup } from "../position-lookup";

const B = "0400000000000000";
const STAND: Quantum3 = [1000, 1000, 1000];
const CAPTURE: Quantum3 = [11_000, 1000, 1000];
const axis = new FlagAxis(STAND, CAPTURE);

function aLookupWith(startMs: number, endMs: number): PositionLookup {
  return new PositionLookup(
    aFakePlayerPositionsWith({
      tracks: [
        {
          xuid: B,
          teamId: 1,
          lives: [aFakeStraightLifeWith({ slot: 520, startMs, endMs, from: STAND, to: CAPTURE, xuid: B })],
        },
      ],
    }),
  );
}

function aRunStolenAt(stealMs: number, lookup: PositionLookup): OpenRun {
  return new OpenRun(
    0,
    aFakeCtfFlagEventWith({ kind: "steal", xuid: B, teamId: 1, timestampMs: stealMs }),
    axis,
    STAND,
    lookup,
    150,
  );
}

describe("OpenRun", () => {
  it("replaces a stepped sample that lands on the whistle with the terminal capture sample", () => {
    const run = aRunStolenAt(10_000, aLookupWith(10_000, 20_000));

    const closed = run.close(20_200, "capture", { timestampMs: 20_200, kind: "capture" }, 20_000);

    expect(closed.samples.filter((sample) => sample.timestampMs === 20_000)).toEqual([
      { timestampMs: 20_000, progress: 1 },
    ]);
  });

  it("opens with a sample on the steal itself", () => {
    const run = aRunStolenAt(10_000, aLookupWith(10_000, 20_000));

    const closed = run.close(20_000, "matchEnd", null, 60_000);

    expect(closed.samples[0]).toEqual({ timestampMs: 10_000, progress: 0 });
  });

  it("takes the earliest matching death whatever order the feed lists them in", () => {
    const run = aRunStolenAt(10_000, aLookupWith(10_000, 60_000));
    const later = aFakeDeathEventWith({ timestampMs: 40_000, xuid: B });
    const earlier = aFakeDeathEventWith({ timestampMs: 15_000, xuid: B });

    expect(run.carrierDeathBefore(new Set([later, earlier]), 60_000)).toBe(earlier);
  });

  it("calls a carrier never seen since the pickup lost at the pickup itself", () => {
    const run = aRunStolenAt(10_000, aLookupWith(40_000, 50_000));

    expect(run.carrierLostBefore(10_000 + CARRIER_LOST_MS)).toBe(10_000);
  });

  it("keeps the terminal sample at the whistle when a return lands just after it", () => {
    const run = aRunStolenAt(10_000, aLookupWith(10_000, 20_000));

    const closed = run.close(20_300, "return", { timestampMs: 20_300, kind: "return" }, 20_000);

    expect(closed.samples.at(-1)?.timestampMs).toBe(20_000);
  });

  it("finds a vanished carrier across successive scans that each cover part of the gap", () => {
    const run = aRunStolenAt(10_000, aLookupWith(10_000, 20_000));

    expect(run.carrierLostBefore(22_000)).toBeNull();
    expect(run.carrierLostBefore(20_000 + CARRIER_LOST_MS + 500)).toBe(20_000);
  });
});
