import { describe, expect, it } from "vitest";
import type { ObjectiveControlProgressionEvent } from "../types";
import { findBestKothCaptureAssignment } from "../koth-capture-search";

function eventsFromTicks(ticksByTeam: ReadonlyMap<number, readonly number[]>): ObjectiveControlProgressionEvent[] {
  const merged: { timestampMs: number; teamId: number }[] = [];
  for (const [teamId, ticks] of ticksByTeam) {
    for (const timestampMs of ticks) {
      merged.push({ timestampMs, teamId });
    }
  }
  merged.sort((a, b) => a.timestampMs - b.timestampMs);

  const running = new Map<number, number>([...ticksByTeam.keys()].map((teamId) => [teamId, 0]));
  return merged.map(({ timestampMs, teamId }) => {
    running.set(teamId, (running.get(teamId) ?? 0) + 1);
    return { timestampMs, teamId, runningScores: Object.fromEntries(running) };
  });
}

// Real match 5c39e8a4-1986-4221-8c9e-dbb46fdfe2ca (2:1 Eagle). Captures verified against
// gameplay footage: Eagle at 3:14 and 5:03, Cobra at 7:00; hill 4 never captured.
const MATCH_5C39_TICKS = new Map<number, readonly number[]>([
  [
    0,
    [
      90431, 95436, 160302, 165308, 170313, 178355, 188384, 193666, 215421, 236776, 268792, 278629, 283626, 288631,
      293636, 302478, 349342, 354346, 389532, 394537, 401661, 406666, 476853,
    ],
  ],
  [1, [113656, 134710, 139715, 144720, 313589, 329956, 373733, 378738, 383743, 416175, 419812]],
]);

// Real match 72c3006a-82fc-48a2-8a2f-f862b675f984 (3:0 Eagle). Captures verified against
// gameplay footage: Eagle at 2:36, 4:28 and 7:02; hill 4 never captured.
const MATCH_72C3_TICKS = new Map<number, readonly number[]>([
  [
    0,
    [
      57618, 63077, 101948, 104834, 109839, 143123, 156837, 209993, 232048, 236603, 241608, 254354, 259359, 264365,
      268352, 298449, 304638, 309643, 314649, 358059, 365683, 396881, 422941, 499318,
    ],
  ],
  [
    1,
    [
      68362, 172836, 177842, 182846, 187851, 192856, 197847, 202852, 327194, 340124, 348198, 382067, 393661, 434319,
      440992, 446615, 457960,
    ],
  ],
]);

describe("findBestKothCaptureAssignment", () => {
  it("returns the verified capture timestamps for match 5c39e8a4 (2:1, Cobra takes hill 3)", () => {
    const events = eventsFromTicks(MATCH_5C39_TICKS);
    const result = findBestKothCaptureAssignment(
      events,
      new Map([
        [0, 2],
        [1, 1],
      ]),
    );
    expect(result).toEqual([193666, 302478, 419812]);
  });

  it("attributes the 419812 capture of match 5c39e8a4 to Cobra", () => {
    const events = eventsFromTicks(MATCH_5C39_TICKS);
    const capturingEvent = events.find((event) => event.timestampMs === 419812);
    expect(capturingEvent?.teamId).toBe(1);
  });

  it("returns the verified capture timestamps for match 72c3006a (3:0 Eagle)", () => {
    const events = eventsFromTicks(MATCH_72C3_TICKS);
    const result = findBestKothCaptureAssignment(
      events,
      new Map([
        [0, 3],
        [1, 0],
      ]),
    );
    expect(result).toEqual([156837, 268352, 422941]);
  });

  it("never places a capture on a tick followed within the relocation gap by another tick", () => {
    // Ticks every 5000ms in one continuous 10-tick burst; a capture mid-burst is impossible
    // because the hill would have relocated. Only the final tick qualifies.
    const events = eventsFromTicks(
      new Map([[0, [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000]]]),
    );
    const result = findBestKothCaptureAssignment(events, new Map([[0, 1]]));
    expect(result).toEqual([50000]);
  });

  it("places only the captures that fit when the match score exceeds available ticks", () => {
    const events = eventsFromTicks(new Map([[0, [5000, 10000, 15000, 20000, 25000]]]));
    const result = findBestKothCaptureAssignment(
      events,
      new Map([
        [0, 3],
        [1, 2],
      ]),
    );
    expect(result).toEqual([25000]);
  });

  it("returns empty when there are no events", () => {
    const result = findBestKothCaptureAssignment([], new Map([[0, 2]]));
    expect(result).toEqual([]);
  });

  it("returns empty when no team has enough ticks for a capture", () => {
    const events = eventsFromTicks(new Map([[0, [5000, 10000]]]));
    const result = findBestKothCaptureAssignment(events, new Map([[0, 1]]));
    expect(result).toEqual([]);
  });

  it("prefers uniform per-hill tick counts over a lopsided split", () => {
    // Two 8-tick Team 0 hills and a 7-tick Team 1 hill: {8,8,7} beats splits like {5,11,7}.
    const events = eventsFromTicks(
      new Map<number, readonly number[]>([
        [0, [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 60000, 65000, 70000, 75000, 80000, 85000, 90000, 95000]],
        [1, [115000, 120000, 125000, 130000, 135000, 140000, 145000]],
      ]),
    );
    const result = findBestKothCaptureAssignment(
      events,
      new Map([
        [0, 2],
        [1, 1],
      ]),
    );
    expect(result).toEqual([40000, 95000, 145000]);
  });
});
