import { describe, expect, it, vi } from "vitest";
import type { LivePreSeriesResponse } from "@guilty-spark/shared/contracts/stats/pre-series";
import { LivePreSeriesCache } from "../cache";
import { aFakeLivePreSeriesResponseWith, aFakeLivePreSeriesServiceWith } from "../fakes/live-pre-series.fake";
import type { LivePreSeriesScope } from "../types";

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
  it("deduplicates table/ticker requests and retains the final captured roster without polling", async () => {
    const data = aFakeLivePreSeriesResponseWith();
    const service = aFakeLivePreSeriesServiceWith(data);
    const spy = vi.spyOn(service, "getCapturedRoster");
    const cache = new LivePreSeriesCache(service);
    expect(spy).not.toHaveBeenCalled();
    const [table, ticker] = await Promise.all([cache.load(aScopeWith()), cache.load(aScopeWith())]);
    expect(table).toEqual(data);
    expect(ticker).toBe(table);
    expect(table.status === "resolved" ? table.players.length : 0).toBe(8);
    // Backend disposal cannot replace an already captured final live snapshot.
    spy.mockResolvedValue({ status: "stopped" });
    expect(await cache.load(aScopeWith())).toBe(table);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it.each([
    { seriesStartedAt: "2026-11-07T00:00:00.000Z" },
    { rosterRevision: "roster-2" },
    { guildId: "999" },
    { queueNumber: "8" },
  ])("loads again when scope changes %#", async (change) => {
    const service = aFakeLivePreSeriesServiceWith();
    const spy = vi.spyOn(service, "getCapturedRoster");
    const cache = new LivePreSeriesCache(service);
    await cache.load(aScopeWith());
    await cache.load(aScopeWith(change));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("invalidates a reused roster token explicitly", async () => {
    const service = aFakeLivePreSeriesServiceWith();
    const spy = vi.spyOn(service, "getCapturedRoster");
    const cache = new LivePreSeriesCache(service);
    await cache.load(aScopeWith());
    cache.invalidateRoster();
    await cache.load(aScopeWith());
    expect(spy).toHaveBeenCalledTimes(2);
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
    const service = aFakeLivePreSeriesServiceWith(original);
    const spy = vi.spyOn(service, "getCapturedRoster");
    const cache = new LivePreSeriesCache(service);
    await cache.load(aScopeWith());
    spy.mockResolvedValue(substituted);
    cache.invalidateRoster();
    const scope = aScopeWith({ rosterRevision: "roster-2" });
    const [table, ticker] = await Promise.all([cache.load(scope), cache.load(scope)]);
    expect(table).toEqual(substituted);
    expect(ticker).toBe(table);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("retries errors rather than caching a missing result", async () => {
    const service = aFakeLivePreSeriesServiceWith();
    const spy = vi.spyOn(service, "getCapturedRoster").mockRejectedValueOnce(new Error("Failed"));
    const cache = new LivePreSeriesCache(service);
    await expect(cache.load(aScopeWith())).rejects.toThrow("Failed");
    expect(await cache.load(aScopeWith())).toEqual(aFakeLivePreSeriesResponseWith());
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("retries a synchronously throwing injected service", async () => {
    const service = aFakeLivePreSeriesServiceWith();
    const spy = vi.spyOn(service, "getCapturedRoster").mockImplementationOnce(() => {
      throw new Error("Failed");
    });
    const cache = new LivePreSeriesCache(service);
    await expect(cache.load(aScopeWith())).rejects.toThrow("Failed");
    await cache.load(aScopeWith());
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it.each(["not-found", "stopped"])("permits retry after %s", async (status) => {
    const service = aFakeLivePreSeriesServiceWith();
    const spy = vi
      .spyOn(service, "getCapturedRoster")
      .mockResolvedValueOnce(status === "not-found" ? { status: "not-found" } : { status: "stopped" });
    const cache = new LivePreSeriesCache(service);
    expect(await cache.load(aScopeWith())).toEqual({ status });
    expect(await cache.load(aScopeWith())).toEqual(aFakeLivePreSeriesResponseWith());
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it.each(["resolved", "not-found", "error"])("ignores late old %s completion after invalidation", async (status) => {
    expect.assertions(status === "error" ? 4 : 3);
    const service = aFakeLivePreSeriesServiceWith();
    const resolve = vi.fn<(response: LivePreSeriesResponse) => void>();
    const reject = vi.fn<(error: Error) => void>();
    const oldRequest = new Promise<LivePreSeriesResponse>((onResolve, onReject) => {
      resolve.mockImplementation(onResolve);
      reject.mockImplementation(onReject);
    });
    const newer = aFakeLivePreSeriesResponseWith({ rosterRevision: "new" });
    const spy = vi.spyOn(service, "getCapturedRoster").mockReturnValueOnce(oldRequest).mockResolvedValue(newer);
    const cache = new LivePreSeriesCache(service);
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
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does not share captured state between mount instances", async () => {
    const service = aFakeLivePreSeriesServiceWith();
    const spy = vi.spyOn(service, "getCapturedRoster");
    await new LivePreSeriesCache(service).load(aScopeWith());
    await new LivePreSeriesCache(service).load(aScopeWith());
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does not let a late previous series replace the current series", async () => {
    const service = aFakeLivePreSeriesServiceWith();
    const resolve = vi.fn<(response: LivePreSeriesResponse) => void>();
    const pending = new Promise<LivePreSeriesResponse>((onResolve) => resolve.mockImplementation(onResolve));
    const newer = aFakeLivePreSeriesResponseWith({ seriesStartedAt: "2026-11-07T00:00:00.000Z" });
    const spy = vi.spyOn(service, "getCapturedRoster").mockReturnValueOnce(pending).mockResolvedValue(newer);
    const cache = new LivePreSeriesCache(service);
    const old = cache.load(aScopeWith());
    await Promise.resolve();
    const current = aScopeWith({ seriesStartedAt: newer.seriesStartedAt });
    await cache.load(current);
    resolve(aFakeLivePreSeriesResponseWith());
    await old;
    expect(await cache.load(current)).toBe(newer);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
