import { describe, expect, it } from "vitest";
import type { MatchAnalytics } from "../../stats/match-analytics";
import { matchAnalyticsSchema, requestedModulesQuerySchema } from "../../stats/match-analytics";

function aValidAnalytics(): MatchAnalytics {
  return {
    requestedModules: ["killMatrix"],
    killMatrix: {
      "2533274844642438:2533274881185517": {
        count: 8,
        headshotKills: 3,
        perfects: 2,
        weapons: [{ weaponId: "3009000042C9679F", name: "BR75", count: 5 }],
      },
    },
    metadata: {
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 1 },
      perfectCounts: { total: 0, byXuid: {} },
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
        killMatrix: { "not-a-valid-key": { count: 1, headshotKills: 0, perfects: 0, weapons: [] } },
      }).success,
    ).toBe(false);
  });

  it("rejects negative pairingQuality values", () => {
    expect(
      matchAnalyticsSchema.safeParse({
        ...aValidAnalytics(),
        metadata: {
          pairingQuality: { unpairedDeathCount: -1, maxTimeDeltaMs: 1 },
          perfectCounts: { total: 0, byXuid: {} },
        },
      }).success,
    ).toBe(false);
  });
});
