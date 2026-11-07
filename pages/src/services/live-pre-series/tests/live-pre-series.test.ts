import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { livePreSeriesContract } from "@guilty-spark/shared/contracts/stats/pre-series";
import { aFakeLivePreSeriesResponseWith } from "../fakes/live-pre-series.fake";
import { RealLivePreSeriesService } from "../live-pre-series";

describe("RealLivePreSeriesService", () => {
  const identity = { guildId: "123456789012345678", queueNumber: "7" };
  let fetchSpy: MockInstance<typeof globalThis.fetch>;
  let service: RealLivePreSeriesService;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    service = new RealLivePreSeriesService({ apiHost: "https://api.example.com" });
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns all eight captured players in one credentialed no-store request", async () => {
    const data = aFakeLivePreSeriesResponseWith();
    fetchSpy.mockResolvedValueOnce(livePreSeriesContract.toResponse(data));
    expect(await service.getCapturedRoster(identity)).toEqual(data);
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      "https://api.example.com/api/stats/discord/123456789012345678/7/pre-series",
      { credentials: "include", cache: "no-store" },
    );
  });

  it("preserves paused rosters and missing captured values without enrichment", async () => {
    const data = aFakeLivePreSeriesResponseWith({
      trackerStatus: "paused",
      players: [{ playerId: "unassociated", teamIndex: 0, rosterJoinedAt: "2026-11-06T00:00:00.000Z", captured: null }],
    });
    fetchSpy.mockResolvedValueOnce(livePreSeriesContract.toResponse(data));
    expect(await service.getCapturedRoster(identity)).toEqual(data);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("preserves 404 not-found for absent and disposed trackers", async () => {
    const data = livePreSeriesContract.parse({ status: "not-found" });
    fetchSpy.mockResolvedValueOnce(livePreSeriesContract.toResponse(data, { status: 404 }));
    expect(await service.getCapturedRoster(identity)).toEqual(data);
  });

  it.each([
    { status: 500, body: { status: "not-found" } },
    { status: 500, body: { error: "Backend failed" } },
    { status: 403, body: { status: "stopped" } },
    { status: 200, body: { status: "not-found" } },
    { status: 404, body: aFakeLivePreSeriesResponseWith() },
    { status: 200, body: { status: "resolved", players: [] } },
    { status: 200, body: { ...aFakeLivePreSeriesResponseWith(), players: [{ captured: {} }] } },
    { status: 200, body: aFakeLivePreSeriesResponseWith({ guildId: "999" }) },
    { status: 200, body: aFakeLivePreSeriesResponseWith({ queueNumber: 8 }) },
  ])("rejects mismatched or malformed response %#", async ({ status, body }) => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
    await expect(service.getCapturedRoster(identity)).rejects.toThrow();
  });

  it("propagates malformed JSON and transport errors", async () => {
    const error = new Error("Network failed");
    fetchSpy.mockResolvedValueOnce(new Response("{")).mockRejectedValueOnce(error);
    await expect(service.getCapturedRoster(identity)).rejects.toThrow();
    await expect(service.getCapturedRoster(identity)).rejects.toBe(error);
  });

  it.each([
    { guildId: "1/../../other", queueNumber: "7" },
    { guildId: "123", queueNumber: "7?other=1" },
    { guildId: "123", queueNumber: "0" },
    { guildId: "123", queueNumber: "9007199254740992" },
  ])("validates numeric path parameters before fetch %#", async (input) => {
    await expect(service.getCapturedRoster(input)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
