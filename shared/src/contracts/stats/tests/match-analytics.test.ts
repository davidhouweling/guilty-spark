import { describe, expect, it } from "vitest";
import { matchAnalyticsContract } from "../../stats/match-analytics";

describe("matchAnalyticsContract", () => {
  it("accepts kill matrix responses with flat killer/victim keys", () => {
    const parsed = matchAnalyticsContract.safeParse({
      analytics: {
        requestedModules: ["killMatrix"],
        killMatrix: {
          "2533274844642438:2533274881185517": {
            count: 8,
            headshotKills: 3,
            perfects: 2,
            weapons: [
              { weaponId: 3009, count: 5 },
              { weaponId: 1001, count: 3 },
            ],
          },
        },
        metadata: {
          pairingQuality: {
            unpairedDeathCount: 0,
            maxTimeDeltaMs: 1,
          },
          perfectCounts: {
            total: 11,
            byXuid: {
              "2533274844642438": 2,
              "2533274887645992": 3,
            },
          },
        },
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects empty requestedModules array", () => {
    const parsed = matchAnalyticsContract.safeParse({
      analytics: {
        requestedModules: [],
        killMatrix: {},
        metadata: {
          pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 1 },
          perfectCounts: { total: 0, byXuid: {} },
        },
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects unsupported requested modules", () => {
    const parsed = matchAnalyticsContract.safeParse({
      analytics: {
        requestedModules: ["scoreProgression"],
        killMatrix: {},
        metadata: {
          pairingQuality: {
            unpairedDeathCount: 0,
            maxTimeDeltaMs: 1,
          },
          perfectCounts: {
            total: 0,
            byXuid: {},
          },
        },
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects malformed killMatrix keys", () => {
    const parsed = matchAnalyticsContract.safeParse({
      analytics: {
        requestedModules: ["killMatrix"],
        killMatrix: {
          "not-a-valid-key": {
            count: 1,
            headshotKills: 0,
            perfects: 0,
            weapons: [],
          },
        },
        metadata: {
          pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 1 },
          perfectCounts: { total: 0, byXuid: {} },
        },
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects negative pairingQuality values", () => {
    const parsed = matchAnalyticsContract.safeParse({
      analytics: {
        requestedModules: ["killMatrix"],
        killMatrix: {},
        metadata: {
          pairingQuality: { unpairedDeathCount: -1, maxTimeDeltaMs: 1 },
          perfectCounts: { total: 0, byXuid: {} },
        },
      },
    });

    expect(parsed.success).toBe(false);
  });
});
