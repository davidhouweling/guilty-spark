import { matchDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import { aFakeMatchDetailResponseWith } from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installMatchDetailsService } from "../install";

describe("installMatchDetailsService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
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
