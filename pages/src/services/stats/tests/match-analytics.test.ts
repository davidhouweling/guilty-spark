import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { RealMatchAnalyticsService } from "../match-analytics";

function aFakeAnalyticsResponseWith(overrides: Partial<MatchAnalytics> = {}): MatchAnalytics {
  return {
    requestedModules: ["killMatrix"],
    killMatrix: {
      "2533274844642438:2533274881185517": {
        count: 2,
        headshotKills: 1,
        perfects: 0,
        weapons: [],
      },
    },
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
    ...overrides,
  };
}

describe("RealMatchAnalyticsService", () => {
  let fetchSpy: MockInstance<typeof globalThis.fetch>;
  let service: RealMatchAnalyticsService;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    service = new RealMatchAnalyticsService({ apiHost: "https://api.example.com" });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("requests match analytics and parses response", async () => {
    const analytics = aFakeAnalyticsResponseWith();
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ analytics }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    const result = await service.getMatchAnalytics("match-123");

    expect(result).toEqual(analytics);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/stats/match-analytics/match-123?modules=killMatrix",
      { credentials: "include" },
    );
  });

  it("supports explicit module requests", async () => {
    const analytics = aFakeAnalyticsResponseWith();
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ analytics }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    await service.getMatchAnalytics("match-123", ["killMatrix"]);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/stats/match-analytics/match-123?modules=killMatrix",
      { credentials: "include" },
    );
  });
});
