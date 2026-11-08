import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { LivePreSeriesResponse } from "@guilty-spark/shared/contracts/stats/pre-series";
import { LivePreSeriesCache } from "../cache";
import { aFakeLivePreSeriesResponseWith, aFakeLivePreSeriesServiceWith } from "../fakes/live-pre-series.fake";
import type { LivePreSeriesScope, LivePreSeriesService } from "../types";

function aScopeWith(overrides: Partial<LivePreSeriesScope> = {}): LivePreSeriesScope {
  return {
    guildId: "123456789012345678",
    queueNumber: "7",
    seriesStartedAt: "2026-11-06T00:00:00.000Z",
    rosterRevision: "roster-1",
    ...overrides,
  };
}

describe("LivePreSeriesCache", () => {
  let service: LivePreSeriesService;
  let cache: LivePreSeriesCache;
  let getCapturedRosterSpy: MockInstance<LivePreSeriesService["getCapturedRoster"]>;

  beforeEach(() => {
    service = aFakeLivePreSeriesServiceWith();
    getCapturedRosterSpy = vi.spyOn(service, "getCapturedRoster");
    cache = new LivePreSeriesCache(service);
  });

  it("deduplicates table/ticker requests and retains the final captured roster without polling", async () => {
    const data = aFakeLivePreSeriesResponseWith();
    getCapturedRosterSpy.mockResolvedValue(data);
    expect(getCapturedRosterSpy).not.toHaveBeenCalled();
    const [table, ticker] = await Promise.all([cache.load(aScopeWith()), cache.load(aScopeWith())]);
    expect(table).toEqual(data);
    expect(ticker).toBe(table);
    expect(table.status === "resolved" ? table.players.length : 0).toBe(8);
    // Backend disposal cannot replace an already captured final live snapshot.
    getCapturedRosterSpy.mockResolvedValue({ status: "not-found" });
    expect(await cache.load(aScopeWith())).toBe(table);
    expect(getCapturedRosterSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    { seriesStartedAt: "2026-11-07T00:00:00.000Z" },
    { rosterRevision: "roster-2" },
    { guildId: "999" },
    { queueNumber: "8" },
  ])("loads again when scope changes %#", async (change) => {
    await cache.load(aScopeWith());
    await cache.load(aScopeWith(change));
    expect(getCapturedRosterSpy).toHaveBeenCalledTimes(2);
  });

  it("invalidates a reused roster token explicitly", async () => {
    await cache.load(aScopeWith());
    cache.invalidateRoster();
    await cache.load(aScopeWith());
    expect(getCapturedRosterSpy).toHaveBeenCalledTimes(2);
  });

  it("shares the substituted captured roster without refreshing retained players", async () => {
    const original = aFakeLivePreSeriesResponseWith();
    const incoming = {
      playerId: "incoming",
      teamIndex: 0,
      rosterJoinedAt: "2026-11-06T01:00:00.000Z",
      captured: null,
    };
    const substituted = aFakeLivePreSeriesResponseWith({
      rosterRevision: "roster-2",
      players: [...original.players.slice(1), incoming],
    });
    getCapturedRosterSpy.mockResolvedValue(original);
    await cache.load(aScopeWith());
    getCapturedRosterSpy.mockResolvedValue(substituted);
    cache.invalidateRoster();
    const scope = aScopeWith({ rosterRevision: "roster-2" });
    const [table, ticker] = await Promise.all([cache.load(scope), cache.load(scope)]);
    expect(table).toEqual(substituted);
    expect(ticker).toBe(table);
    expect(getCapturedRosterSpy).toHaveBeenCalledTimes(2);
  });

  it("retries errors rather than caching a missing result", async () => {
    getCapturedRosterSpy.mockRejectedValueOnce(new Error("Failed"));
    await expect(cache.load(aScopeWith())).rejects.toThrow("Failed");
    expect(await cache.load(aScopeWith())).toEqual(aFakeLivePreSeriesResponseWith());
    expect(getCapturedRosterSpy).toHaveBeenCalledTimes(2);
  });

  it("retries a synchronously throwing injected service", async () => {
    getCapturedRosterSpy.mockImplementationOnce(() => {
      throw new Error("Failed");
    });
    await expect(cache.load(aScopeWith())).rejects.toThrow("Failed");
    await cache.load(aScopeWith());
    expect(getCapturedRosterSpy).toHaveBeenCalledTimes(2);
  });

  it("permits retry after a missing or disposed roster", async () => {
    getCapturedRosterSpy.mockResolvedValueOnce({ status: "not-found" });
    expect(await cache.load(aScopeWith())).toEqual({ status: "not-found" });
    expect(await cache.load(aScopeWith())).toEqual(aFakeLivePreSeriesResponseWith());
    expect(getCapturedRosterSpy).toHaveBeenCalledTimes(2);
  });

  it.each(["resolved", "not-found", "error"])("ignores late old %s completion after invalidation", async (status) => {
    expect.assertions(status === "error" ? 4 : 3);
    const resolve = vi.fn<(response: LivePreSeriesResponse) => void>();
    const reject = vi.fn<(error: Error) => void>();
    const oldRequest = new Promise<LivePreSeriesResponse>((onResolve, onReject) => {
      resolve.mockImplementation(onResolve);
      reject.mockImplementation(onReject);
    });
    const newer = aFakeLivePreSeriesResponseWith({ rosterRevision: "new" });
    getCapturedRosterSpy.mockReturnValueOnce(oldRequest).mockResolvedValue(newer);
    const old = cache.load(aScopeWith());
    await Promise.resolve();
    cache.invalidateRoster();
    expect(await cache.load(aScopeWith())).toBe(newer);
    if (status === "error") {
      reject(new Error("Old failure"));
      await expect(old).rejects.toThrow("Old failure");
    } else {
      resolve(status === "resolved" ? aFakeLivePreSeriesResponseWith() : { status: "not-found" });
      await old;
    }
    expect(await cache.load(aScopeWith())).toBe(newer);
    expect(getCapturedRosterSpy).toHaveBeenCalledTimes(2);
  });

  it("does not share captured state between mount instances", async () => {
    await new LivePreSeriesCache(service).load(aScopeWith());
    await new LivePreSeriesCache(service).load(aScopeWith());
    expect(getCapturedRosterSpy).toHaveBeenCalledTimes(2);
  });

  it("does not let a late previous series replace the current series", async () => {
    const resolve = vi.fn<(response: LivePreSeriesResponse) => void>();
    const pending = new Promise<LivePreSeriesResponse>((onResolve) => resolve.mockImplementation(onResolve));
    const newer = aFakeLivePreSeriesResponseWith({ seriesStartedAt: "2026-11-07T00:00:00.000Z" });
    getCapturedRosterSpy.mockReturnValueOnce(pending).mockResolvedValue(newer);
    const old = cache.load(aScopeWith());
    await Promise.resolve();
    const current = aScopeWith({ seriesStartedAt: newer.seriesStartedAt });
    await cache.load(current);
    resolve(aFakeLivePreSeriesResponseWith());
    await old;
    expect(await cache.load(current)).toBe(newer);
    expect(getCapturedRosterSpy).toHaveBeenCalledTimes(2);
  });
});
