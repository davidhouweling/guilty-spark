import { matchDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import {
  aFakeMatchDetailResponseWith,
  aFakeMatchDetailWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { RealSeriesMatchesService } from "../series-matches";

describe("RealSeriesMatchesService.getMatchDetails", () => {
  let fetchSpy: MockInstance<typeof globalThis.fetch>;
  let service: RealSeriesMatchesService;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    service = new RealSeriesMatchesService({ apiHost: "https://api.example.com" });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("requests and validates the ordered condensed match batch", async () => {
    const response = aFakeMatchDetailResponseWith({
      matchIds: ["match-1", "missing"],
      results: [
        { status: "resolved", matchId: "match-1", detail: aFakeMatchDetailWith({ matchId: "match-1" }) },
        { status: "unavailable", matchId: "missing", reason: "not-found" },
      ],
    });
    fetchSpy.mockResolvedValueOnce(matchDetailContract.toResponse(response));

    await expect(service.getMatchDetails(["match-1", "missing"], " tracker-1 ")).resolves.toEqual(response);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/stats/match-details?matchIds=match-1%2Cmissing&trackerId=tracker-1",
      { credentials: "include" },
    );
  });

  it("omits a blank trackerId and rejects malformed batch responses", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }));

    await expect(service.getMatchDetails(["match-1"], "  ")).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledWith("https://api.example.com/api/stats/match-details?matchIds=match-1", {
      credentials: "include",
    });
  });

  it("preserves the API host path prefix when adding match and tracker parameters", async () => {
    service = new RealSeriesMatchesService({ apiHost: "https://api.example.com/gateway/" });
    fetchSpy.mockResolvedValueOnce(matchDetailContract.toResponse(aFakeMatchDetailResponseWith()));

    await service.getMatchDetails(["match-1", "match-2"], "tracker-1");

    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      "https://api.example.com/gateway/api/stats/match-details?matchIds=match-1%2Cmatch-2&trackerId=tracker-1",
      { credentials: "include" },
    );
  });

  it("uses the shared batch limit and rejects an oversized request before fetching", async () => {
    await expect(
      service.getMatchDetails(Array.from({ length: 31 }, (_, index) => `match-${index.toString()}`)),
    ).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
