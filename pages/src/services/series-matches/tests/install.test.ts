import { matchDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import { aFakeMatchDetailResponseWith } from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installSeriesMatchesService } from "../install";
import { aFakeSeriesMatchesServiceWith } from "../fakes/series-matches.fake";

describe("installSeriesMatchesService", () => {
  it("preserves legacy fake overrides alongside complete prepared selections", async () => {
    const service = aFakeSeriesMatchesServiceWith({ playerXuidToGametag: { player: "Name" } });
    await expect(service.getSeriesMatches(["missing"])).resolves.toEqual({
      playerXuidToGametag: { player: "Name" },
      matches: [],
    });
    const response = await service.getSeriesDetail("series", ["second", "first", "second"]);
    expect(response.matches.matchIds).toEqual(["second", "first", "second"]);
    expect(response.matches.results.map((result) => result.matchId)).toEqual(["second", "first", "second"]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(["fake", "test"])("installs an offline condensed client in %s mode", async (mode) => {
    vi.stubEnv("MODE", mode);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const service = await installSeriesMatchesService("https://api.example.com");

    const response = await service.getMatchDetails(["match-1"]);

    expect(response.matchIds).toEqual(["match-1"]);
    expect(response.results[0]).toMatchObject({
      status: "resolved",
      matchId: "match-1",
      detail: { matchId: "match-1" },
    });
    const matchIds = Array.from({ length: 31 }, (_, index) => `match-${index.toString()}`);
    const series = await service.getSeriesDetail("series", matchIds);
    expect(series.seriesId).toBe("series");
    expect(series.matches.matchIds).toEqual(matchIds);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("installs the authenticated API client and preserves unavailable results in real mode", async () => {
    vi.stubEnv("MODE", "production");
    const response = aFakeMatchDetailResponseWith({
      matchIds: ["missing"],
      results: [{ status: "unavailable", matchId: "missing", reason: "not-found" }],
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(matchDetailContract.toResponse(response));
    const service = await installSeriesMatchesService("https://api.example.com");

    await expect(service.getMatchDetails(["missing"], "tracker-1")).resolves.toEqual(response);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/stats/match-details?matchIds=missing&trackerId=tracker-1",
      { credentials: "include" },
    );
  });
});
