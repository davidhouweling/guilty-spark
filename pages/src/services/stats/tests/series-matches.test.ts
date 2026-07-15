import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealSeriesMatchesService } from "../series-matches";

describe("RealSeriesMatchesService.getSeriesMatches", () => {
  let fetchSpy: MockInstance<typeof globalThis.fetch>;
  let service: RealSeriesMatchesService;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    service = new RealSeriesMatchesService({ apiHost: "https://api.example.com" });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("fetches series matches and returns the parsed response", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ playerXuidToGametag: {}, matches: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await service.getSeriesMatches(["match-1", "match-2"], "tracker-1");

    expect(result).toEqual({ playerXuidToGametag: {}, matches: [] });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/stats/series-matches?matchIds=match-1%2Cmatch-2&trackerId=tracker-1",
      { credentials: "include" },
    );
  });

  it("omits trackerId query param when trackerId is blank after trimming", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ playerXuidToGametag: {}, matches: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await service.getSeriesMatches(["match-1"], "   ");

    expect(fetchSpy).toHaveBeenCalledWith("https://api.example.com/api/stats/series-matches?matchIds=match-1", {
      credentials: "include",
    });
  });
});
