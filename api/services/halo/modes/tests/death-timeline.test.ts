import { describe, expect, it } from "vitest";
import { aFakeParsedHighlightEventWith } from "../../fakes/parsed-highlight-event.fake";
import { buildDeathTimeline } from "../death-timeline";

describe("buildDeathTimeline", () => {
  it("keeps death events for known teams in film order", () => {
    const events = [
      aFakeParsedHighlightEventWith({ timeMs: 5000, teamId: 1 }),
      aFakeParsedHighlightEventWith({ timeMs: 12000, teamId: 0 }),
      aFakeParsedHighlightEventWith({ timeMs: 20000, teamId: 1 }),
    ];
    expect(buildDeathTimeline(events, new Set([0, 1]), 600000)).toEqual([
      { timestampMs: 5000, teamId: 1 },
      { timestampMs: 12000, teamId: 0 },
      { timestampMs: 20000, teamId: 1 },
    ]);
  });

  it("drops non-death events, unattributed deaths, and unknown teams", () => {
    const events = [
      aFakeParsedHighlightEventWith({ timeMs: 5000, eventType: "kill" }),
      aFakeParsedHighlightEventWith({ timeMs: 6000, teamId: null }),
      aFakeParsedHighlightEventWith({ timeMs: 7000, teamId: 5 }),
      aFakeParsedHighlightEventWith({ timeMs: 8000, teamId: 1 }),
    ];
    expect(buildDeathTimeline(events, new Set([0, 1]), 600000)).toEqual([{ timestampMs: 8000, teamId: 1 }]);
  });

  it("drops trailing film deaths past the match duration, keeping one exactly at it", () => {
    const events = [
      aFakeParsedHighlightEventWith({ timeMs: 599000, teamId: 0 }),
      aFakeParsedHighlightEventWith({ timeMs: 600000, teamId: 1 }),
      aFakeParsedHighlightEventWith({ timeMs: 600001, teamId: 0 }),
    ];
    expect(buildDeathTimeline(events, new Set([0, 1]), 600000)).toEqual([
      { timestampMs: 599000, teamId: 0 },
      { timestampMs: 600000, teamId: 1 },
    ]);
  });
});
