import { describe, expect, it } from "vitest";
import type { MatchAnalytics } from "../match-analytics";
import { matchAnalyticsSchema, requestedModulesQuerySchema } from "../match-analytics";

function aValidAnalytics(): MatchAnalytics {
  return {
    requestedModules: ["killMatrix"],
    killMatrix: {
      "2533274844642438:2533274881185517": {
        count: 8,
        perfects: 2,
      },
    },
    scoreProgression: null,
  };
}

describe("requestedModulesQuerySchema", () => {
  it("parses a modules CSV into a deduped analytics module array", () => {
    const result = requestedModulesQuerySchema.safeParse("killMatrix, killMatrix");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(["killMatrix"]);
    }
  });

  it("defaults to killMatrix when no value is provided", () => {
    const result = requestedModulesQuerySchema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(["killMatrix"]);
    }
  });

  it("accepts scoreProgression as a valid module", () => {
    const result = requestedModulesQuerySchema.safeParse("scoreProgression");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(["scoreProgression"]);
    }
  });

  it("rejects unsupported modules", () => {
    expect(requestedModulesQuerySchema.safeParse("fooBar").success).toBe(false);
  });

  it("rejects empty modules after parsing", () => {
    expect(requestedModulesQuerySchema.safeParse(" , ").success).toBe(false);
  });
});

describe("matchAnalyticsSchema", () => {
  it("accepts a valid analytics payload", () => {
    expect(matchAnalyticsSchema.safeParse(aValidAnalytics()).success).toBe(true);
  });

  it("rejects empty requestedModules array", () => {
    expect(matchAnalyticsSchema.safeParse({ ...aValidAnalytics(), requestedModules: [] }).success).toBe(false);
  });

  it("accepts scoreProgression as a valid requested module", () => {
    expect(
      matchAnalyticsSchema.safeParse({ ...aValidAnalytics(), requestedModules: ["scoreProgression"] }).success,
    ).toBe(true);
  });

  it("rejects unsupported requested modules", () => {
    expect(matchAnalyticsSchema.safeParse({ ...aValidAnalytics(), requestedModules: ["fooBar"] }).success).toBe(false);
  });

  it("rejects malformed killMatrix keys", () => {
    expect(
      matchAnalyticsSchema.safeParse({
        ...aValidAnalytics(),
        killMatrix: { "not-a-valid-key": { count: 1, perfects: 0 } },
      }).success,
    ).toBe(false);
  });

  it("accepts a strongholds timeline with sparse running scores", () => {
    const result = matchAnalyticsSchema.safeParse({
      ...aValidAnalytics(),
      scoreProgression: {
        mode: 11,
        durationMs: 684000,
        teamCount: 2,
        timeline: {
          type: "strongholds",
          events: [
            { timestampMs: 40000, runningScores: { "0": 5 } },
            { timestampMs: 90000, runningScores: { "0": 30, "1": 12 } },
          ],
          zoneEvents: [
            { timestampMs: 35000, teamId: 0, kind: "capture" },
            { timestampMs: 80000, teamId: 1, kind: "secure" },
          ],
          zoneTimeline: [
            { timestampMs: 0, zoneCounts: { "0": 1, "1": 1 } },
            { timestampMs: 35000, zoneCounts: { "0": 2, "1": 1 } },
          ],
          deathTimeline: [{ timestampMs: 42000, teamId: 1 }],
          respawnDurationMs: 8000,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a strongholds timeline with negative running scores", () => {
    const result = matchAnalyticsSchema.safeParse({
      ...aValidAnalytics(),
      scoreProgression: {
        mode: 11,
        durationMs: 684000,
        teamCount: 2,
        timeline: {
          type: "strongholds",
          events: [{ timestampMs: 40000, runningScores: { "0": -5 } }],
          zoneEvents: [],
          zoneTimeline: [],
          deathTimeline: [],
          respawnDurationMs: null,
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a strongholds zone event with an unknown kind", () => {
    const result = matchAnalyticsSchema.safeParse({
      ...aValidAnalytics(),
      scoreProgression: {
        mode: 11,
        durationMs: 684000,
        teamCount: 2,
        timeline: {
          type: "strongholds",
          events: [{ timestampMs: 40000, runningScores: { "0": 5 } }],
          zoneEvents: [{ timestampMs: 35000, teamId: 0, kind: "contest" }],
          zoneTimeline: [],
          deathTimeline: [],
          respawnDurationMs: null,
        },
      },
    });
    expect(result.success).toBe(false);
  });
});
