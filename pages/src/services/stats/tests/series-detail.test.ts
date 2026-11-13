import { seriesDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import {
  aFakeMatchDetailWith,
  aFakeSeriesDetailResponseWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { RealSeriesDetailService } from "../series-detail";

describe("RealSeriesDetailService.getSeriesDetail", () => {
  let fetchSpy: MockInstance<typeof globalThis.fetch>;
  let service: RealSeriesDetailService;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    service = new RealSeriesDetailService({ apiHost: "https://api.example.com" });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("preserves chronological match order and selected series identity with tracker scope", async () => {
    const detail = aFakeSeriesDetailResponseWith({
      seriesId: "guild:queue/1",
      matches: {
        matchIds: ["older-match", "newer-match"],
        results: [
          {
            status: "resolved",
            matchId: "older-match",
            detail: aFakeMatchDetailWith({
              matchId: "older-match",
              startTime: "2024-11-26T11:05:39.587Z",
              endTime: "2024-11-26T11:14:25.091Z",
            }),
          },
          {
            status: "unavailable",
            matchId: "newer-match",
            reason: "fetch-failed",
          },
        ],
      },
      aggregation: { status: "unavailable", reason: "incomplete-matches" },
    });
    fetchSpy.mockResolvedValueOnce(seriesDetailContract.toResponse(detail));

    await expect(
      service.getSeriesDetail("guild:queue/1", ["older-match", "newer-match"], "tracker-1"),
    ).resolves.toEqual(detail);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/stats/series-details/guild%3Aqueue%2F1?matchIds=older-match%2Cnewer-match&trackerId=tracker-1",
      { credentials: "include" },
    );
  });

  it("omits a blank trackerId and rejects malformed series responses", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ seriesId: "series" }), { status: 200 }));

    await expect(service.getSeriesDetail("series", ["match-1"], "  ")).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledWith("https://api.example.com/api/stats/series-details/series?matchIds=match-1", {
      credentials: "include",
    });
  });

  it("uses the shared batch limit and rejects an oversized selection before fetching", async () => {
    await expect(
      service.getSeriesDetail(
        "series",
        Array.from({ length: 31 }, (_, index) => `match-${index.toString()}`),
      ),
    ).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
