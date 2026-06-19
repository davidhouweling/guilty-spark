import { describe, expect, it } from "vitest";
import type { MatchAnalytics } from "../../stats/match-analytics";
import { matchAnalyticsSchema } from "../../stats/match-analytics";

function aValidAnalytics(): MatchAnalytics {
  return {
    requestedModules: ["killMatrix"],
    killMatrix: {
      "2533274844642438:2533274881185517": {
        count: 8,
        headshotKills: 3,
        perfects: 2,
        weapons: [{ weaponId: 3009, count: 5 }],
      },
    },
    metadata: {
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 1 },
      perfectCounts: { total: 0, byXuid: {} },
    },
  };
}

describe("matchAnalyticsSchema", () => {
  it("accepts a valid analytics payload", () => {
    expect(matchAnalyticsSchema.safeParse(aValidAnalytics()).success).toBe(true);
  });

  it("rejects empty requestedModules array", () => {
    expect(matchAnalyticsSchema.safeParse({ ...aValidAnalytics(), requestedModules: [] }).success).toBe(false);
  });

  it("rejects unsupported requested modules", () => {
    expect(
      matchAnalyticsSchema.safeParse({ ...aValidAnalytics(), requestedModules: ["scoreProgression"] }).success,
    ).toBe(false);
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
