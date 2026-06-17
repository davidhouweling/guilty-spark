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

  it("encodes matchId path segment", async () => {
    const analytics = aFakeAnalyticsResponseWith();
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ analytics }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    await service.getMatchAnalytics("match/123?abc=1");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/stats/match-analytics/match%2F123%3Fabc%3D1?modules=killMatrix",
      { credentials: "include" },
    );
  });
});

describe("RealMatchAnalyticsService.getBatchMatchAnalytics", () => {
  let fetchSpy: MockInstance<typeof globalThis.fetch>;
  let service: RealMatchAnalyticsService;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    service = new RealMatchAnalyticsService({ apiHost: "https://api.example.com" });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("fetches batch analytics and returns results record", async () => {
    const analytics = aFakeAnalyticsResponseWith();
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: {
            "match-1": analytics,
            "match-2": analytics,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await service.getBatchMatchAnalytics(["match-1", "match-2"]);

    expect(result).toEqual({ "match-1": analytics, "match-2": analytics });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/stats/match-analytics?matchIds=match-1%2Cmatch-2&modules=killMatrix",
      { credentials: "include" },
    );
  });

  it("passes explicit modules in the query", async () => {
    const analytics = aFakeAnalyticsResponseWith();
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: { "match-1": analytics } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await service.getBatchMatchAnalytics(["match-1"], ["killMatrix"]);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/stats/match-analytics?matchIds=match-1&modules=killMatrix",
      { credentials: "include" },
    );
  });

  it("preserves null results for failed matchIds", async () => {
    const analytics = aFakeAnalyticsResponseWith();
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: {
            "match-ok": analytics,
            "match-fail": null,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await service.getBatchMatchAnalytics(["match-ok", "match-fail"]);

    expect(result).toEqual({ "match-ok": analytics, "match-fail": null });
  });
});
