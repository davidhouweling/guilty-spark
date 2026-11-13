import { matchDetailContract, seriesDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import {
  aFakeMatchDetailResponseWith,
  aFakeSeriesDetailResponseWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installMatchDetailsService, installSeriesDetailService } from "../install";

describe("installMatchDetailsService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("installSeriesDetailService", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it.each(["fake", "test"])("installs an offline whole-series client in %s mode", async (mode) => {
      vi.stubEnv("MODE", mode);
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const service = await installSeriesDetailService("https://api.example.com");
      const matchIds = Array.from({ length: 31 }, (_, index) => `match-${index.toString()}`);

      const response = await service.getSeriesDetail("series", matchIds);

      expect(response.seriesId).toBe("series");
      expect(response.matches.matchIds).toEqual(matchIds);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("installs the authenticated API client in real mode", async () => {
      vi.stubEnv("MODE", "production");
      const response = aFakeSeriesDetailResponseWith();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(seriesDetailContract.toResponse(response));
      const service = await installSeriesDetailService("https://api.example.com");

      await expect(service.getSeriesDetail("series", ["match-1"], "tracker-1")).resolves.toEqual(response);
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.example.com/api/stats/series-details/series?matchIds=match-1&trackerId=tracker-1",
        { credentials: "include" },
      );
    });
  });

  it.each(["fake", "test"])("installs an offline condensed client in %s mode", async (mode) => {
    vi.stubEnv("MODE", mode);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const service = await installMatchDetailsService("https://api.example.com");

    const response = await service.getMatchDetails(["match-1"]);

    expect(response.matchIds).toEqual(["match-1"]);
    expect(response.results[0]).toMatchObject({
      status: "resolved",
      matchId: "match-1",
      detail: { matchId: "match-1" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("installs the authenticated API client and preserves unavailable results in real mode", async () => {
    vi.stubEnv("MODE", "production");
    const response = aFakeMatchDetailResponseWith({
      matchIds: ["missing"],
      results: [{ status: "unavailable", matchId: "missing", reason: "not-found" }],
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(matchDetailContract.toResponse(response));
    const service = await installMatchDetailsService("https://api.example.com");

    await expect(service.getMatchDetails(["missing"], "tracker-1")).resolves.toEqual(response);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/stats/match-details?matchIds=missing&trackerId=tracker-1",
      { credentials: "include" },
    );
  });
});
