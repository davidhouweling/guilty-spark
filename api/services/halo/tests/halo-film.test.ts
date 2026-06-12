import { deflateSync } from "node:zlib";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { getMatchStats } from "../fakes/data";
import { CustomSpartanTokenProvider } from "../custom-spartan-token-provider";
import { HaloFilmService } from "../halo-film";
import type { ParsedHighlightEvent } from "../types";
import { aFakeXboxServiceWith } from "../../xbox/fakes/xbox.fake";

interface CacheContainer {
  default: Cache;
}

let installedDefaultCache: Cache | undefined;

function installInMemoryDefaultCache(): void {
  const cacheEntries = new Map<string, Response>();
  const cache: Cache = {
    match: async (request: RequestInfo | URL): Promise<Response | undefined> => {
      const key = typeof request === "string" ? request : request instanceof URL ? request.toString() : request.url;
      const response = cacheEntries.get(key);
      return Promise.resolve(response?.clone());
    },
    put: async (request: RequestInfo | URL, response: Response): Promise<void> => {
      const key = typeof request === "string" ? request : request instanceof URL ? request.toString() : request.url;
      cacheEntries.set(key, response.clone());
      return Promise.resolve();
    },
    delete: async (request: RequestInfo | URL): Promise<boolean> => {
      const key = typeof request === "string" ? request : request instanceof URL ? request.toString() : request.url;
      return Promise.resolve(cacheEntries.delete(key));
    },
  };

  installedDefaultCache = cache;
  vi.stubGlobal("caches", { default: cache } satisfies CacheContainer);
}

function restoreDefaultCache(): void {
  installedDefaultCache = undefined;
  vi.unstubAllGlobals();
}

function defaultCache(): Cache {
  return Preconditions.checkExists(installedDefaultCache);
}

const metadataCacheRequestFor = (matchId: string): Request =>
  new Request(`https://halo-film-cache.local/metadata/${matchId}`);

const chunkCacheRequestFor = (matchId: string, chunkIndex: number): Request =>
  new Request(`https://halo-film-cache.local/chunk/${matchId}/${chunkIndex.toString()}`);

function aMutableKvNamespaceWith(): KVNamespace {
  const data = new Map<string, string>();

  return {
    getWithMetadata: async () => Promise.resolve({ value: null, metadata: null, cacheStatus: null }),
    get: async (key: string, type?: "text" | "json" | "arrayBuffer" | "stream") => {
      const value = data.get(key) ?? null;
      if (value == null) {
        return null;
      }

      if (type === "json") {
        return JSON.parse(value) as unknown;
      }
      if (type === "arrayBuffer") {
        return new TextEncoder().encode(value).buffer;
      }
      if (type === "stream") {
        return new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(value));
            controller.close();
          },
        });
      }

      return value;
    },
    put: async (key: string, value: string) => {
      data.set(key, value);
      return Promise.resolve();
    },
    list: async () =>
      Promise.resolve({
        list_complete: true,
        keys: Array.from(data.keys()).map((name) => ({ name })),
        cacheStatus: null,
      }),
    delete: async (key: string) => {
      data.delete(key);
      return Promise.resolve();
    },
  } as unknown as KVNamespace;
}

async function aFakeCacheBackedEnvWith(): Promise<Env> {
  const kvNamespace = aMutableKvNamespaceWith();
  return aFakeEnvWith({ APP_DATA: kvNamespace });
}

describe("HaloFilmService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installInMemoryDefaultCache();
  });

  afterEach(() => {
    restoreDefaultCache();
  });

  it("uses metadata and chunk cache keys before network fetch", async () => {
    const env = await aFakeCacheBackedEnvWith();
    const xboxService = aFakeXboxServiceWith({ env });
    const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
    vi.spyOn(spartanTokenProvider, "getSpartanToken").mockResolvedValue("test-spartan-token");
    await env.APP_DATA.put("film:clearance", "test-clearance-token");
    const service = new HaloFilmService({ env, spartanTokenProvider });

    const compressedChunk = deflateSync(Uint8Array.of(0x01, 0x02, 0x03));
    const metadata = {
      AssetId: "asset-id",
      BlobStoragePathPrefix: "https://blob.example/",
      CustomData: {
        MatchId: "match-123",
        FilmMajorVersion: 42,
        FilmLength: 500,
        Chunks: [
          {
            Index: 9,
            ChunkType: 3,
            DurationMilliseconds: 500,
            ChunkSize: compressedChunk.byteLength,
            FileRelativePath: "/chunk.bin",
          },
        ],
      },
    };

    await defaultCache().put(metadataCacheRequestFor("match-123"), Response.json(metadata));
    await defaultCache().put(chunkCacheRequestFor("match-123", 9), new Response(compressedChunk));

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const events = await service.getHighlightEventsForMatch("match-123");

    expect(events).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches and caches metadata and chunk bytes on cache miss", async () => {
    const env = await aFakeCacheBackedEnvWith();
    const xboxService = aFakeXboxServiceWith({ env });
    const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
    vi.spyOn(spartanTokenProvider, "getSpartanToken").mockResolvedValue("test-spartan-token");
    await env.APP_DATA.put("film:clearance", "test-clearance-token");
    const service = new HaloFilmService({ env, spartanTokenProvider });

    const compressedChunk = deflateSync(Uint8Array.of(0x04, 0x05, 0x06));
    const metadata = {
      AssetId: "asset-id",
      BlobStoragePathPrefix: "https://blob.example/",
      CustomData: {
        MatchId: "match-456",
        FilmMajorVersion: 42,
        FilmLength: 600,
        Chunks: [
          {
            Index: 7,
            ChunkType: 3,
            DurationMilliseconds: 600,
            ChunkSize: compressedChunk.byteLength,
            FileRelativePath: "/chunk-7.bin",
          },
        ],
      },
    };

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
        await Promise.resolve();
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (requestUrl.includes("/spectate")) {
          return new Response(JSON.stringify(metadata), { status: 200 });
        }

        return new Response(compressedChunk, { status: 200 });
      });

    const firstRead = await service.getHighlightEventsForMatch("match-456");
    const secondRead = await service.getHighlightEventsForMatch("match-456");

    expect(firstRead).toEqual([]);
    expect(secondRead).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(await defaultCache().match(metadataCacheRequestFor("match-456"))).toBeDefined();
    expect(await defaultCache().match(chunkCacheRequestFor("match-456", 7))).toBeDefined();
  });

  describe("clearance token caching", () => {
    function mockFetch(
      clearanceToken: string,
      metadata: unknown,
      compressedChunk: Uint8Array,
    ): MockInstance<typeof globalThis.fetch> {
      return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
          await Promise.resolve();
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          if (url.includes("/users/me")) {
            return new Response(JSON.stringify({ xuid: "1234567890" }), { status: 200 });
          }
          if (url.includes("flight-configurations")) {
            return new Response(JSON.stringify({ FlightConfigurationId: clearanceToken }), { status: 200 });
          }
          if (url.includes("/spectate")) {
            return new Response(JSON.stringify(metadata), { status: 200 });
          }
          return new Response(compressedChunk, { status: 200 });
        });
    }

    it("fetches and caches clearance token on first call", async () => {
      const env = await aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      vi.spyOn(spartanTokenProvider, "getSpartanToken").mockResolvedValue("test-spartan-token");
      const service = new HaloFilmService({ env, spartanTokenProvider });

      const compressedChunk = deflateSync(Uint8Array.of(0x01));
      const metadata = {
        AssetId: "asset-id",
        BlobStoragePathPrefix: "https://blob.example/",
        CustomData: {
          MatchId: "clearance-test-1",
          FilmMajorVersion: 42,
          FilmLength: 100,
          Chunks: [{ Index: 1, ChunkType: 3, DurationMilliseconds: 100, ChunkSize: 1, FileRelativePath: "/c.bin" }],
        },
      };
      mockFetch("clearance-abc", metadata, compressedChunk);

      await service.getHighlightEventsForMatch("clearance-test-1");

      expect(await env.APP_DATA.get("film:clearance")).toBe("clearance-abc");
    });

    it("reuses cached clearance token and skips settings endpoints on second call", async () => {
      const env = await aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      vi.spyOn(spartanTokenProvider, "getSpartanToken").mockResolvedValue("test-spartan-token");
      const service = new HaloFilmService({ env, spartanTokenProvider });

      const compressedChunk = deflateSync(Uint8Array.of(0x01));
      const metadata = {
        AssetId: "asset-id",
        BlobStoragePathPrefix: "https://blob.example/",
        CustomData: {
          MatchId: "clearance-test-2",
          FilmMajorVersion: 42,
          FilmLength: 100,
          Chunks: [{ Index: 1, ChunkType: 3, DurationMilliseconds: 100, ChunkSize: 1, FileRelativePath: "/c.bin" }],
        },
      };
      const fetchSpy = mockFetch("clearance-xyz", metadata, compressedChunk);

      await service.getHighlightEventsForMatch("clearance-test-2");
      const callsAfterFirst = fetchSpy.mock.calls.map((args) => {
        const [input] = args;
        return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      });
      const settingsCallCount = callsAfterFirst.filter((url) => url.includes("flight-configurations")).length;
      expect(settingsCallCount).toBe(1);

      fetchSpy.mockClear();

      const metadata2 = {
        ...metadata,
        CustomData: { ...metadata.CustomData, MatchId: "clearance-test-2b" },
      };
      fetchSpy.mockImplementation(async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
        await Promise.resolve();
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes("/spectate")) {
          return new Response(JSON.stringify(metadata2), { status: 200 });
        }
        return new Response(compressedChunk, { status: 200 });
      });

      await service.getHighlightEventsForMatch("clearance-test-2b");

      const secondCallUrls = fetchSpy.mock.calls.map((args) => {
        const [input] = args;
        return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      });
      expect(secondCallUrls.some((url) => url.includes("/users/me"))).toBe(false);
      expect(secondCallUrls.some((url) => url.includes("flight-configurations"))).toBe(false);
    });
  });

  it("builds kill matrix analytics with pairing quality and perfect counts", async () => {
    const env = await aFakeCacheBackedEnvWith();
    const xboxService = aFakeXboxServiceWith({ env });
    const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
    const service = new HaloFilmService({ env, spartanTokenProvider });

    const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    const killerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
    const victimXuid = unwrapXuid(Preconditions.checkExists(match.Players[1]).PlayerId);

    const mockHighlightEvents: ParsedHighlightEvent[] = [
      {
        xuid: killerXuid,
        gamertag: "killer",
        typeHint: 50,
        isMedal: false,
        eventType: "kill",
        timeMs: 100,
        medalValue: 0,
        teamId: null,
      },
      {
        xuid: victimXuid,
        gamertag: "victim",
        typeHint: 20,
        isMedal: false,
        eventType: "death",
        timeMs: 100,
        medalValue: 0,
        teamId: null,
      },
      {
        xuid: killerXuid,
        gamertag: "killer",
        typeHint: 50,
        isMedal: false,
        eventType: "kill",
        timeMs: 200,
        medalValue: 0,
        teamId: null,
      },
      {
        xuid: victimXuid,
        gamertag: "victim",
        typeHint: 20,
        isMedal: false,
        eventType: "death",
        timeMs: 200,
        medalValue: 0,
        teamId: null,
      },
      {
        xuid: killerXuid,
        gamertag: "killer",
        typeHint: 210,
        isMedal: true,
        eventType: "medal",
        timeMs: 205,
        medalValue: 1512363953,
        teamId: null,
      },
      {
        xuid: victimXuid,
        gamertag: "victim",
        typeHint: 20,
        isMedal: false,
        eventType: "death",
        timeMs: 500,
        medalValue: 0,
        teamId: null,
      },
    ];
    vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue(mockHighlightEvents);

    const analytics = await service.buildKillMatrixAnalytics(match);
    const [entry] = analytics.entries;

    expect(entry).toEqual({
      killerXuid,
      victimXuid,
      count: 2,
      headshotKills: 0,
      perfects: 1,
      weapons: [],
    });
    expect(analytics.pairingQuality).toEqual({
      unpairedDeathCount: 1,
      maxTimeDeltaMs: 0,
    });
    expect(analytics.perfectCounts).toEqual({
      total: 1,
      byXuid: { [killerXuid]: 1 },
    });
  });

  describe("kill-death pairing edge cases", () => {
    it("pairs kills and deaths at exactly the boundary (1ms delta)", async () => {
      const env = await aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
      const killerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
      const victimXuid = unwrapXuid(Preconditions.checkExists(match.Players[1]).PlayerId);

      const mockHighlightEvents: ParsedHighlightEvent[] = [
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 1000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 1001,
          medalValue: 0,
          teamId: null,
        },
      ];
      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue(mockHighlightEvents);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.entries).toHaveLength(1);
      expect(analytics.pairingQuality.unpairedDeathCount).toBe(0);
    });

    it("does not pair kills and deaths exceeding 1ms delta", async () => {
      const env = await aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
      const killerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
      const victimXuid = unwrapXuid(Preconditions.checkExists(match.Players[1]).PlayerId);

      const mockHighlightEvents: ParsedHighlightEvent[] = [
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 1000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 1003,
          medalValue: 0,
          teamId: null,
        },
      ];
      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue(mockHighlightEvents);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.entries).toEqual([]);
      expect(analytics.pairingQuality.unpairedDeathCount).toBe(1);
    });

    it("handles multiple deaths at same timestamp with greedy pairing", async () => {
      const env = await aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
      const killerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
      const victimXuid = unwrapXuid(Preconditions.checkExists(match.Players[1]).PlayerId);

      const mockHighlightEvents: ParsedHighlightEvent[] = [
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 1000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 1000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 1000,
          medalValue: 0,
          teamId: null,
        },
      ];
      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue(mockHighlightEvents);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.entries).toHaveLength(1);
      expect(analytics.entries[0]?.count).toBe(1);
      expect(analytics.pairingQuality.unpairedDeathCount).toBe(0);
    });

    it("pairs kill before death (negative delta)", async () => {
      const env = await aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
      const killerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
      const victimXuid = unwrapXuid(Preconditions.checkExists(match.Players[1]).PlayerId);

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 1001,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 1000,
          medalValue: 0,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.entries).toHaveLength(1);
      expect(analytics.pairingQuality.maxTimeDeltaMs).toBe(1);
    });
  });

  describe("perfect medal detection", () => {
    it("detects perfect medal by name ID", async () => {
      const env = await aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
      const killerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
      const victimXuid = unwrapXuid(Preconditions.checkExists(match.Players[1]).PlayerId);

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 1000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 1000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 210,
          isMedal: true,
          eventType: "medal",
          timeMs: 1000,
          medalValue: 1512363953,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.perfectCounts.total).toBe(1);
      expect(analytics.perfectCounts.byXuid[killerXuid]).toBe(1);
    });

    it("detects multiple perfects for same killer", async () => {
      const env = await aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
      const killerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
      const victimXuid = unwrapXuid(Preconditions.checkExists(match.Players[1]).PlayerId);

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 1000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 1000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 210,
          isMedal: true,
          eventType: "medal",
          timeMs: 1000,
          medalValue: 1512363953,
          teamId: null,
        },
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 210,
          isMedal: true,
          eventType: "medal",
          timeMs: 1001,
          medalValue: 1512363953,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.perfectCounts.total).toBe(2);
      expect(analytics.perfectCounts.byXuid[killerXuid]).toBe(2);
    });

    it("distinguishes perfect medal from perfection medal", async () => {
      const env = await aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
      const killerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
      const victimXuid = unwrapXuid(Preconditions.checkExists(match.Players[1]).PlayerId);

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 1000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 1000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 210,
          isMedal: true,
          eventType: "medal",
          timeMs: 1000,
          medalValue: 865763896,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.perfectCounts.total).toBe(0);
    });
  });

  describe("error handling", () => {
    it("returns empty analytics when no events match any kills", async () => {
      const env = await aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        {
          xuid: "1",
          gamertag: "a",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 1,
          medalValue: 0,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.entries).toEqual([]);
    });

    it("handles match with no events", async () => {
      const env = await aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([]);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.entries).toEqual([]);
      expect(analytics.pairingQuality.unpairedDeathCount).toBe(0);
      expect(analytics.perfectCounts.total).toBe(0);
    });
  });

  describe("weapon aggregation", () => {
    it("aggregates kills with different weapons per pair", async () => {
      const env = await aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
      const killerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
      const victimXuid = unwrapXuid(Preconditions.checkExists(match.Players[1]).PlayerId);

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 1,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 1,
          medalValue: 0,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.entries).toHaveLength(1);
      expect(analytics.entries[0]?.weapons).toEqual([]);
    });
  });
});
