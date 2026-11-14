import { describe, expect, it } from "vitest";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { aFakeMatchAnalyticsWith } from "../../services/analytics/fakes/analytics.fake";
import { assertKothAnalyticsMatch } from "../koth-compare-production";

function aKothAnalyticsWith(overrides: Partial<MatchAnalytics> = {}): MatchAnalytics {
  return aFakeMatchAnalyticsWith({
    requestedModules: ["killMatrix", "scoreProgression"],
    scoreProgression: {
      mode: 12,
      durationMs: 732600,
      teamCount: 2,
      timeline: {
        type: "koth",
        events: [{ timestampMs: 1000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
        hillCaptureTimestamps: [1000],
        controlPeriods: [],
        deathTimeline: [{ timestampMs: 500, teamId: 1 }],
        respawnDurationMs: 8000,
      },
    },
    ...overrides,
  });
}

describe("assertKothAnalyticsMatch", () => {
  it("accepts matching KOTH analytics regardless of object-key insertion order", () => {
    const production = aKothAnalyticsWith();
    const local = aKothAnalyticsWith({
      killMatrix: { "2533274844642438:2533274881185517": { perfects: 0, count: 3 } },
    });

    expect(() => {
      assertKothAnalyticsMatch(local, production);
    }).not.toThrow();
  });

  it("rejects a kill-matrix difference even when the timelines match", () => {
    const production = aKothAnalyticsWith();
    const local = aKothAnalyticsWith({
      killMatrix: { "2533274844642438:2533274881185517": { count: 4, perfects: 0 } },
    });

    expect(() => {
      assertKothAnalyticsMatch(local, production);
    }).toThrow("Local KOTH analytics differ from production");
  });

  it("rejects a changed timeline even when the kill matrices match", () => {
    const production = aKothAnalyticsWith();
    const local = aKothAnalyticsWith();
    if (local.scoreProgression?.timeline.type !== "koth") {
      throw new Error("Expected KOTH fixture");
    }
    local.scoreProgression.timeline.hillCaptureTimestamps = [1001];

    expect(() => {
      assertKothAnalyticsMatch(local, production);
    }).toThrow("Local KOTH analytics differ from production");
  });

  it("rejects matching null or degraded results instead of reporting success", () => {
    expect(() => {
      assertKothAnalyticsMatch(null, null);
    }).toThrow("Local analytics did not produce a KOTH timeline");
    expect(() => {
      assertKothAnalyticsMatch(aKothAnalyticsWith({ scoreProgression: null }), aKothAnalyticsWith());
    }).toThrow("Local analytics did not produce a KOTH timeline");
    expect(() => {
      assertKothAnalyticsMatch(aKothAnalyticsWith(), undefined);
    }).toThrow("Production analytics did not produce a KOTH timeline");
  });
});
