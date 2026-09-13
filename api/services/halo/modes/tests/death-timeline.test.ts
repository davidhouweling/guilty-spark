import { describe, expect, it } from "vitest";
import type { ParsedHighlightEvent } from "../../types";
import { buildDeathTimeline } from "../death-timeline";

function anEvent(overrides: Partial<ParsedHighlightEvent>): ParsedHighlightEvent {
  return {
    xuid: "2100000000000001",
    gamertag: "player-1",
    typeHint: 3,
    isMedal: false,
    eventType: "death",
    timeMs: 1000,
    medalValue: 0,
    teamId: 0,
    ...overrides,
  };
}

describe("buildDeathTimeline", () => {
  it("keeps death events for known teams in film order", () => {
    const events = [
      anEvent({ timeMs: 5000, teamId: 1 }),
      anEvent({ timeMs: 12000, teamId: 0 }),
      anEvent({ timeMs: 20000, teamId: 1 }),
    ];
    expect(buildDeathTimeline(events, new Set([0, 1]))).toEqual([
      { timestampMs: 5000, teamId: 1 },
      { timestampMs: 12000, teamId: 0 },
      { timestampMs: 20000, teamId: 1 },
    ]);
  });

  it("drops non-death events, unattributed deaths, and unknown teams", () => {
    const events = [
      anEvent({ timeMs: 5000, eventType: "kill" }),
      anEvent({ timeMs: 6000, teamId: null }),
      anEvent({ timeMs: 7000, teamId: 5 }),
      anEvent({ timeMs: 8000, teamId: 1 }),
    ];
    expect(buildDeathTimeline(events, new Set([0, 1]))).toEqual([{ timestampMs: 8000, teamId: 1 }]);
  });
});
