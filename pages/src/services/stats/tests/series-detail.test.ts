import { seriesDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import {
  aFakeMatchDetailWith,
  aFakeSeriesDetailResponseWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { RealSeriesDetailService } from "../series-detail";
import { aFakeSeriesDetailServiceWith } from "../fakes/series-detail.fake";

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

  it.each([" tracker-1 ", "  "])(
    "posts the entire large selection with normalized tracker hint %j",
    async (trackerId) => {
      const matchIds = Array.from({ length: 31 }, (_, index) => `match-${index.toString()}`);
      const detail = await aFakeSeriesDetailServiceWith().getSeriesDetail("guild:queue/1", matchIds);
      fetchSpy.mockResolvedValueOnce(seriesDetailContract.toResponse(detail));

      await expect(service.getSeriesDetail("guild:queue/1", matchIds, trackerId)).resolves.toEqual(detail);
      expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
        `https://api.example.com/api/stats/series-details/guild%3Aqueue%2F1${trackerId.trim() === "" ? "" : "?trackerId=tracker-1"}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchIds }),
        },
      );
    },
  );

  it("keeps a 30-match selection on the GET path", async () => {
    const matchIds = Array.from({ length: 30 }, (_, index) => `match-${index.toString()}`);
    const detail = await aFakeSeriesDetailServiceWith().getSeriesDetail("series", matchIds);
    fetchSpy.mockResolvedValueOnce(seriesDetailContract.toResponse(detail));

    await expect(service.getSeriesDetail("series", matchIds)).resolves.toEqual(detail);
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      `https://api.example.com/api/stats/series-details/series?${new URLSearchParams({ matchIds: matchIds.join(",") }).toString()}`,
      { credentials: "include" },
    );
  });

  it.each([{ matchIds: [] }, { matchIds: [" "] }])(
    "rejects invalid selection $matchIds before fetching",
    async ({ matchIds }) => {
      await expect(service.getSeriesDetail("series", matchIds)).rejects.toThrow();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});

describe("FakeSeriesDetailService", () => {
  it("preserves more than 30 selected matches without fetching", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const matchIds = Array.from({ length: 61 }, (_, index) => `match-${index.toString()}`);
    try {
      const response = await aFakeSeriesDetailServiceWith().getSeriesDetail("series", matchIds);

      expect(response.matches.matchIds).toEqual(matchIds);
      expect(response.matches.results.map((result) => result.matchId)).toEqual(matchIds);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
