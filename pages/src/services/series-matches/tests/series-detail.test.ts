import { seriesDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import type { SeriesTeamMappingMode } from "@guilty-spark/shared/contracts/stats/detail";
import {
  aFakeMatchDetailWith,
  aFakeSeriesDetailResponseWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { RealSeriesMatchesService } from "../series-matches";
import { aFakeConfiguredTeamContextWith, aFakeSeriesMatchesServiceWith } from "../fakes/series-matches.fake";

describe("RealSeriesMatchesService.getSeriesDetail", () => {
  let fetchSpy: MockInstance<typeof globalThis.fetch>;
  let service: RealSeriesMatchesService;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    service = new RealSeriesMatchesService({ apiHost: "https://api.example.com" });
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
      matchIds.push("match-0");
      const detail = await aFakeSeriesMatchesServiceWith().getSeriesDetail("guild:queue/1", matchIds);
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
    const detail = await aFakeSeriesMatchesServiceWith().getSeriesDetail("series", matchIds);
    fetchSpy.mockResolvedValueOnce(seriesDetailContract.toResponse(detail));

    await expect(service.getSeriesDetail("series", matchIds)).resolves.toEqual(detail);
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      `https://api.example.com/api/stats/series-details/series?${new URLSearchParams({ matchIds: matchIds.join(",") }).toString()}`,
      { credentials: "include" },
    );
  });

  it.each([1, 31])("posts explicit configured-team context with %i matches", async (count) => {
    const matchIds = Array.from({ length: count }, (_, index) => `match-${index.toString()}`);
    const configuredTeamContext = aFakeConfiguredTeamContextWith();
    const detail = await aFakeSeriesMatchesServiceWith().getSeriesDetail("series", matchIds);
    fetchSpy.mockResolvedValueOnce(seriesDetailContract.toResponse(detail));

    await expect(
      service.getSeriesDetail("series", matchIds, " tracker-1 ", undefined, configuredTeamContext),
    ).resolves.toEqual(detail);
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      "https://api.example.com/api/stats/series-details/series?trackerId=tracker-1",
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchIds, configuredTeamContext }),
      },
    );
  });

  it("rejects mixed configured context and mapping mode before fetching", async () => {
    await expect(
      service.getSeriesDetail("series", ["match-1"], undefined, "substitution-aware", aFakeConfiguredTeamContextWith()),
    ).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([30, 31])("handles a trailing slash in the API host for %i matches", async (count) => {
    const matchIds = Array.from({ length: count }, (_, index) => `match-${index.toString()}`);
    const detail = await aFakeSeriesMatchesServiceWith().getSeriesDetail("guild:queue/1", matchIds);
    fetchSpy.mockResolvedValueOnce(seriesDetailContract.toResponse(detail));
    service = new RealSeriesMatchesService({ apiHost: "https://api.example.com/" });

    await expect(service.getSeriesDetail("guild:queue/1", matchIds, " tracker-1 ")).resolves.toEqual(detail);
    const query = new URLSearchParams();
    if (count === 30) {
      query.set("matchIds", matchIds.join(","));
    }
    query.set("trackerId", "tracker-1");
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      `https://api.example.com/api/stats/series-details/guild%3Aqueue%2F1?${query.toString()}`,
    );
  });

  describe.each([1, 31])("with %i selected matches", (matchCount) => {
    it.each<SeriesTeamMappingMode>(["exact-roster", "substitution-aware"])(
      "sends explicit %s mode without changing the selected matches or credentials",
      async (teamMappingMode) => {
        const matchIds = Array.from({ length: matchCount }, (_, index) => `match-${index.toString()}`);
        const detail = await aFakeSeriesMatchesServiceWith().getSeriesDetail("series", matchIds);
        fetchSpy.mockResolvedValueOnce(seriesDetailContract.toResponse(detail));

        await expect(service.getSeriesDetail("series", matchIds, " tracker-1 ", teamMappingMode)).resolves.toEqual(
          detail,
        );
        const query = new URLSearchParams(
          matchCount === 1
            ? { matchIds: matchIds.join(","), trackerId: "tracker-1", teamMappingMode }
            : { trackerId: "tracker-1" },
        );
        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
          `https://api.example.com/api/stats/series-details/series?${query.toString()}`,
          matchCount === 1
            ? { credentials: "include" }
            : {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ matchIds, teamMappingMode }),
              },
        );
      },
    );
  });

  it("rejects an invalid mapping mode before fetching", async () => {
    // @ts-expect-error Untyped callers can supply invalid mapping modes.
    await expect(service.getSeriesDetail("series", ["match-1"], undefined, "invalid")).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([{ matchIds: [] }, { matchIds: [" "] }])(
    "rejects invalid selection $matchIds before fetching",
    async ({ matchIds }) => {
      await expect(service.getSeriesDetail("series", matchIds)).rejects.toThrow();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});

describe("FakeSeriesMatchesService", () => {
  it("validates configured context and rejects mixed mapping semantics without fetching", async () => {
    const configuredTeamContext = aFakeConfiguredTeamContextWith();
    const service = aFakeSeriesMatchesServiceWith();
    await expect(
      service.getSeriesDetail("series", ["match-1"], undefined, undefined, configuredTeamContext),
    ).resolves.toMatchObject({ seriesId: "series", matches: { matchIds: ["match-1"] } });
    await expect(
      service.getSeriesDetail("series", ["match-1"], undefined, "substitution-aware", configuredTeamContext),
    ).rejects.toThrow();
  });

  it.each<SeriesTeamMappingMode>(["exact-roster", "substitution-aware"])(
    "accepts explicit %s mode without changing fixture identity",
    async (teamMappingMode) => {
      const service = aFakeSeriesMatchesServiceWith();
      await expect(service.getSeriesDetail("series", ["match-1"], undefined, teamMappingMode)).resolves.toMatchObject({
        seriesId: "series",
        matches: { matchIds: ["match-1"] },
      });
    },
  );

  it("rejects an invalid mapping mode even with a configured legacy response", async () => {
    const service = aFakeSeriesMatchesServiceWith({ matches: [] });

    // @ts-expect-error Untyped callers can supply invalid mapping modes.
    await expect(service.getSeriesDetail("series", ["match-1"], undefined, "invalid")).rejects.toThrow();
  });

  it("preserves more than 30 selected matches without fetching", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const matchIds = Array.from({ length: 61 }, (_, index) => `match-${index.toString()}`);
    try {
      const response = await aFakeSeriesMatchesServiceWith().getSeriesDetail("series", matchIds);
      expect(response.matches.matchIds).toEqual(matchIds);
      expect(response.matches.results.map((result) => result.matchId)).toEqual(matchIds);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
