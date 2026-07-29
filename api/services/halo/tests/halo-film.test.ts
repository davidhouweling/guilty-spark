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
import { buildFireEventBytes, buildFormulaAEventBytes } from "./film-fire-event-builder";

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
    get: async (key: string, type?: "text" | "json" | "arrayBuffer" | "stream"): Promise<unknown> => {
      const value = data.get(key) ?? null;
      if (value == null) {
        return Promise.resolve(null);
      }

      if (type === "json") {
        return Promise.resolve(JSON.parse(value) as unknown);
      }
      if (type === "arrayBuffer") {
        return Promise.resolve(new TextEncoder().encode(value).buffer);
      }
      if (type === "stream") {
        return Promise.resolve(
          new ReadableStream<Uint8Array>({
            start(controller): void {
              controller.enqueue(new TextEncoder().encode(value));
              controller.close();
            },
          }),
        );
      }

      return Promise.resolve(value);
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

function aFakeCacheBackedEnvWith(): Env {
  const kvNamespace = aMutableKvNamespaceWith();
  return aFakeEnvWith({ APP_DATA: kvNamespace });
}

describe("HaloFilmService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installInMemoryDefaultCache();
    // Fail fast so cockatiel does not start background retry loops in tests that do not mock auth.
    // Tests that need real auth override this with a per-instance spy.
    vi.spyOn(CustomSpartanTokenProvider.prototype, "getSpartanToken").mockRejectedValue(
      new Error("getSpartanToken not mocked for this test"),
    );
  });

  afterEach(() => {
    restoreDefaultCache();
  });

  it("uses metadata and chunk cache keys before network fetch", async () => {
    const env = aFakeCacheBackedEnvWith();
    const xboxService = aFakeXboxServiceWith({ env });
    const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
    const getSpartanTokenSpy = vi
      .spyOn(spartanTokenProvider, "getSpartanToken")
      .mockResolvedValue("test-spartan-token");
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
    expect(getSpartanTokenSpy).not.toHaveBeenCalled();
  });

  it("fetches and caches metadata and chunk bytes on cache miss", async () => {
    const env = aFakeCacheBackedEnvWith();
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

  it("treats cached metadata without highlight chunk as cache miss", async () => {
    const env = aFakeCacheBackedEnvWith();
    const xboxService = aFakeXboxServiceWith({ env });
    const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
    vi.spyOn(spartanTokenProvider, "getSpartanToken").mockResolvedValue("test-spartan-token");
    await env.APP_DATA.put("film:clearance", "test-clearance-token");
    const service = new HaloFilmService({ env, spartanTokenProvider });

    const malformedCachedMetadata = {
      AssetId: "asset-id",
      BlobStoragePathPrefix: "https://blob.example/",
      CustomData: {
        MatchId: "match-789",
        FilmMajorVersion: 42,
        FilmLength: 600,
        Chunks: [
          {
            Index: 5,
            ChunkType: 2,
            DurationMilliseconds: 600,
            ChunkSize: 3,
            FileRelativePath: "/wrong-chunk.bin",
          },
        ],
      },
    };
    await defaultCache().put(metadataCacheRequestFor("match-789"), Response.json(malformedCachedMetadata));

    const compressedChunk = deflateSync(Uint8Array.of(0x07, 0x08, 0x09));
    const fetchedMetadata = {
      AssetId: "asset-id",
      BlobStoragePathPrefix: "https://blob.example/",
      CustomData: {
        MatchId: "match-789",
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
          return new Response(JSON.stringify(fetchedMetadata), { status: 200 });
        }

        return new Response(compressedChunk, { status: 200 });
      });

    const events = await service.getHighlightEventsForMatch("match-789");

    expect(events).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(await defaultCache().match(chunkCacheRequestFor("match-789", 7))).toBeDefined();
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
      const env = aFakeCacheBackedEnvWith();
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
      const env = aFakeCacheBackedEnvWith();
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

    describe("namespaced clearance token caching", () => {
      it("reads clearance token from the namespaced key when kvKeyNamespace is provided", async () => {
        const env = aFakeCacheBackedEnvWith();
        const xboxService = aFakeXboxServiceWith({ env });
        const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
        vi.spyOn(spartanTokenProvider, "getSpartanToken").mockResolvedValue("test-spartan-token");
        await env.APP_DATA.put("halo:film:user-123:clearance", "test-clearance-token");
        const service = new HaloFilmService({
          env,
          spartanTokenProvider,
          kvKeyNamespace: "halo:film:user-123",
        });

        const compressedChunk = deflateSync(Uint8Array.of(0x01));
        const metadata = {
          AssetId: "asset-id",
          BlobStoragePathPrefix: "https://blob.example/",
          CustomData: {
            MatchId: "namespaced-clearance-test-1",
            FilmMajorVersion: 42,
            FilmLength: 100,
            Chunks: [{ Index: 1, ChunkType: 3, DurationMilliseconds: 100, ChunkSize: 1, FileRelativePath: "/c.bin" }],
          },
        };
        const fetchSpy = mockFetch("unused-clearance", metadata, compressedChunk);

        await service.getHighlightEventsForMatch("namespaced-clearance-test-1");

        const fetchedUrls = fetchSpy.mock.calls.map((args) => {
          const [input] = args;
          return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        });
        expect(fetchedUrls.some((url) => url.includes("/users/me"))).toBe(false);
        expect(fetchedUrls.some((url) => url.includes("flight-configurations"))).toBe(false);
        expect(await env.APP_DATA.get("halo:film:user-123:clearance")).toBe("test-clearance-token");
      });

      it("stores clearance token in the namespaced key when kvKeyNamespace is provided", async () => {
        const env = aFakeCacheBackedEnvWith();
        const xboxService = aFakeXboxServiceWith({ env });
        const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
        vi.spyOn(spartanTokenProvider, "getSpartanToken").mockResolvedValue("test-spartan-token");
        const service = new HaloFilmService({
          env,
          spartanTokenProvider,
          kvKeyNamespace: "halo:film:user-456",
        });

        const compressedChunk = deflateSync(Uint8Array.of(0x02));
        const metadata = {
          AssetId: "asset-id",
          BlobStoragePathPrefix: "https://blob.example/",
          CustomData: {
            MatchId: "namespaced-clearance-test-2",
            FilmMajorVersion: 42,
            FilmLength: 100,
            Chunks: [{ Index: 1, ChunkType: 3, DurationMilliseconds: 100, ChunkSize: 1, FileRelativePath: "/c.bin" }],
          },
        };
        mockFetch("clearance-namespaced", metadata, compressedChunk);

        await service.getHighlightEventsForMatch("namespaced-clearance-test-2");

        expect(await env.APP_DATA.get("halo:film:user-456:clearance")).toBe("clearance-namespaced");
        expect(await env.APP_DATA.get("film:clearance")).toBeNull();
      });
    });
  });

  it("builds kill matrix analytics with pairing quality and perfect counts", async () => {
    const env = aFakeCacheBackedEnvWith();
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
        medalValue: 1828716544,
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
    it("pairs kills and deaths at exactly the boundary (2ms delta)", async () => {
      const env = aFakeCacheBackedEnvWith();
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
          timeMs: 1002,
          medalValue: 0,
          teamId: null,
        },
      ];
      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue(mockHighlightEvents);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.entries).toHaveLength(1);
      expect(analytics.pairingQuality.unpairedDeathCount).toBe(0);
    });

    it("does not pair kills and deaths exceeding 2ms delta", async () => {
      const env = aFakeCacheBackedEnvWith();
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
      const env = aFakeCacheBackedEnvWith();
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
      const env = aFakeCacheBackedEnvWith();
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
      const env = aFakeCacheBackedEnvWith();
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
          medalValue: 1828716544,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.perfectCounts.total).toBe(1);
      expect(analytics.perfectCounts.byXuid[killerXuid]).toBe(1);
    });

    it("detects multiple perfects for same killer", async () => {
      const env = aFakeCacheBackedEnvWith();
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
          medalValue: 1828716544,
          teamId: null,
        },
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 210,
          isMedal: true,
          eventType: "medal",
          timeMs: 1001,
          medalValue: 1828716544,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.perfectCounts.total).toBe(2);
      expect(analytics.perfectCounts.byXuid[killerXuid]).toBe(2);
    });

    it("distinguishes perfect medal from perfection medal", async () => {
      const env = aFakeCacheBackedEnvWith();
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

  describe("perfect medal per-pair attribution", () => {
    it("attributes perfect medal at same timestamp as kill to that pair", async () => {
      const env = aFakeCacheBackedEnvWith();
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
          medalValue: 1828716544,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);

      expect(analytics.entries[0]?.perfects).toBe(1);
    });

    it("attributes perfect medal within 5ms of kill timestamp to that pair", async () => {
      const env = aFakeCacheBackedEnvWith();
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
          timeMs: 1005,
          medalValue: 1828716544,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);

      expect(analytics.entries[0]?.perfects).toBe(1);
    });

    it("does not attribute perfect medal more than 5ms from kill timestamp", async () => {
      const env = aFakeCacheBackedEnvWith();
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
          timeMs: 1006,
          medalValue: 1828716544,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);

      expect(analytics.entries[0]?.perfects).toBe(0);
    });

    it("consumes each perfect medal once across multiple kills by the same player", async () => {
      const env = aFakeCacheBackedEnvWith();
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
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 2000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 2000,
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
          medalValue: 1828716544,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);

      expect(analytics.entries[0]?.count).toBe(2);
      expect(analytics.entries[0]?.perfects).toBe(1);
    });

    it("consumes the closest perfect medal when multiple medals are within the window for the same kill", async () => {
      const env = aFakeCacheBackedEnvWith();
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
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 2000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 2000,
          medalValue: 0,
          teamId: null,
        },
        // Two medals within the window of kill at 1000ms: one at 999ms (delta 1) and one at 1004ms (delta 4)
        // The kill at 2000ms has no medal nearby, so the 1004ms medal must not be consumed by the second kill
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 210,
          isMedal: true,
          eventType: "medal",
          timeMs: 1004,
          medalValue: 1828716544,
          teamId: null,
        },
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 210,
          isMedal: true,
          eventType: "medal",
          timeMs: 999,
          medalValue: 1828716544,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);

      // kill at 1000ms: closest medal is 999ms (delta 1) — consumed
      // kill at 2000ms: no medal within 5ms — not attributed
      // Remaining medal at 1004ms is left unconsumed
      expect(analytics.entries[0]?.count).toBe(2);
      expect(analytics.entries[0]?.perfects).toBe(1);
      expect(analytics.perfectCounts.total).toBe(2);
    });

    it("does not attribute a perfect medal from a different player to the kill pair", async () => {
      const env = aFakeCacheBackedEnvWith();
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
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 210,
          isMedal: true,
          eventType: "medal",
          timeMs: 1000,
          medalValue: 1828716544,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);

      expect(analytics.entries[0]?.perfects).toBe(0);
    });
  });

  describe("error handling", () => {
    it("returns empty analytics when no events match any kills", async () => {
      const env = aFakeCacheBackedEnvWith();
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
      const env = aFakeCacheBackedEnvWith();
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
      const env = aFakeCacheBackedEnvWith();
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

    it("populates entry weapons from type-2 chunk fire events when film metadata is available", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const getSpartanTokenSpy = vi
        .spyOn(spartanTokenProvider, "getSpartanToken")
        .mockResolvedValue("fake-spartan-token");
      await env.APP_DATA.put("film:clearance", "fake-clearance-token");
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));

      // API response order: Players[0] → playerIndex 0, matching playerIndex 0 fire event
      const killerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
      const victimXuid = unwrapXuid(Preconditions.checkExists(match.Players[1]).PlayerId);

      // Pre-populate CF cache with film metadata containing one type-2 chunk
      const matchId = match.MatchId;
      const filmMetadata = {
        AssetId: "asset-id",
        BlobStoragePathPrefix: "https://blob.example/",
        CustomData: {
          MatchId: matchId,
          FilmMajorVersion: 42,
          FilmLength: 10000,
          Chunks: [
            { Index: 0, ChunkType: 2, DurationMilliseconds: 10000, ChunkSize: 15, FileRelativePath: "/chunk-0.bin" },
          ],
        },
      };
      await defaultCache().put(
        metadataCacheRequestFor(matchId),
        new Response(JSON.stringify(filmMetadata), {
          headers: { "Cache-Control": "max-age=604800", "Content-Type": "application/json" },
        }),
      );

      const BR75_WEAPON_ID = 0x2b1824d542c9679fn;
      const compressedChunk = deflateSync(buildFireEventBytes(0, 0, BR75_WEAPON_ID));
      await defaultCache().put(
        chunkCacheRequestFor(matchId, 0),
        new Response(compressedChunk, {
          headers: { "Cache-Control": "max-age=604800", "Content-Type": "application/octet-stream" },
        }),
      );

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 4000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 4000,
          medalValue: 0,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.entries).toHaveLength(1);
      expect(analytics.entries[0]?.weapons).toEqual([{ weaponId: "2B1824D542C9679F", name: "BR75", count: 1 }]);
      expect(getSpartanTokenSpy).not.toHaveBeenCalled();
    });

    it("decompresses zlib-compressed type-2 chunks before scanning fire events", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const getSpartanTokenSpy = vi
        .spyOn(spartanTokenProvider, "getSpartanToken")
        .mockResolvedValue("fake-spartan-token");
      await env.APP_DATA.put("film:clearance", "fake-clearance-token");
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));

      const killerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
      const victimXuid = unwrapXuid(Preconditions.checkExists(match.Players[1]).PlayerId);

      const matchId = match.MatchId;
      const filmMetadata = {
        AssetId: "asset-id",
        BlobStoragePathPrefix: "https://blob.example/",
        CustomData: {
          MatchId: matchId,
          FilmMajorVersion: 42,
          FilmLength: 10000,
          Chunks: [
            { Index: 0, ChunkType: 2, DurationMilliseconds: 10000, ChunkSize: 15, FileRelativePath: "/chunk-0.bin" },
          ],
        },
      };
      await defaultCache().put(
        metadataCacheRequestFor(matchId),
        new Response(JSON.stringify(filmMetadata), {
          headers: { "Cache-Control": "max-age=604800", "Content-Type": "application/json" },
        }),
      );

      const MA40_WEAPON_ID = 0x48c19d2d42c9679fn;
      const rawFireEventBytes = buildFireEventBytes(0, 0, MA40_WEAPON_ID);
      const compressedBytes = deflateSync(rawFireEventBytes);
      await defaultCache().put(
        chunkCacheRequestFor(matchId, 0),
        new Response(compressedBytes, {
          headers: { "Cache-Control": "max-age=604800", "Content-Type": "application/octet-stream" },
        }),
      );

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 4000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 4000,
          medalValue: 0,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.entries).toHaveLength(1);
      expect(analytics.entries[0]?.weapons).toEqual([{ weaponId: "48C19D2D42C9679F", name: "MA40 AR", count: 1 }]);
      expect(getSpartanTokenSpy).not.toHaveBeenCalled();
    });

    it("aggregates weapon counts across multiple kills and returns weapons sorted by count descending", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      vi.spyOn(spartanTokenProvider, "getSpartanToken").mockResolvedValue("fake-spartan-token");
      await env.APP_DATA.put("film:clearance", "fake-clearance-token");
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));

      const killerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
      const victimXuid = unwrapXuid(Preconditions.checkExists(match.Players[1]).PlayerId);

      const matchId = match.MatchId;
      const filmMetadata = {
        AssetId: "asset-id",
        BlobStoragePathPrefix: "https://blob.example/",
        CustomData: {
          MatchId: matchId,
          FilmMajorVersion: 42,
          FilmLength: 10000,
          // Single type-2 chunk spanning 10000ms; 3 fire events at bytePos 0, 15, 30 in 45 bytes:
          //   event 1 (bytePos 0)  → ts 0ms      (BR75)
          //   event 2 (bytePos 15) → ts 3333ms   (MA40 AR)
          //   event 3 (bytePos 30) → ts 6667ms   (BR75)
          Chunks: [
            { Index: 0, ChunkType: 2, DurationMilliseconds: 10000, ChunkSize: 45, FileRelativePath: "/chunk-0.bin" },
          ],
        },
      };
      await defaultCache().put(
        metadataCacheRequestFor(matchId),
        new Response(JSON.stringify(filmMetadata), {
          headers: { "Cache-Control": "max-age=604800", "Content-Type": "application/json" },
        }),
      );

      const BR75_ID = 0x2b1824d542c9679fn;
      const MA40_ID = 0x48c19d2d42c9679fn;
      const rawChunk = new Uint8Array([
        ...buildFireEventBytes(0, 0, BR75_ID),
        ...buildFireEventBytes(0, 0, MA40_ID),
        ...buildFireEventBytes(0, 0, BR75_ID),
      ]);
      await defaultCache().put(
        chunkCacheRequestFor(matchId, 0),
        new Response(deflateSync(rawChunk), {
          headers: { "Cache-Control": "max-age=604800", "Content-Type": "application/octet-stream" },
        }),
      );

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
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 4000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 4000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 8000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 8000,
          medalValue: 0,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.entries).toHaveLength(1);
      expect(analytics.entries[0]?.count).toBe(3);
      expect(analytics.entries[0]?.weapons).toEqual([
        { weaponId: "2B1824D542C9679F", name: "BR75", count: 2 },
        { weaponId: "48C19D2D42C9679F", name: "MA40 AR", count: 1 },
      ]);
    });

    it("falls back to Formula A weapon snapshot when no fire event matches the kill", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      vi.spyOn(spartanTokenProvider, "getSpartanToken").mockResolvedValue("fake-spartan-token");
      await env.APP_DATA.put("film:clearance", "fake-clearance-token");
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));

      const killerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
      const victimXuid = unwrapXuid(Preconditions.checkExists(match.Players[1]).PlayerId);

      const matchId = match.MatchId;
      const filmMetadata = {
        AssetId: "asset-id",
        BlobStoragePathPrefix: "https://blob.example/",
        CustomData: {
          MatchId: matchId,
          FilmMajorVersion: 42,
          FilmLength: 10000,
          Chunks: [
            { Index: 0, ChunkType: 2, DurationMilliseconds: 10000, ChunkSize: 0, FileRelativePath: "/chunk-0.bin" },
          ],
        },
      };
      await defaultCache().put(
        metadataCacheRequestFor(matchId),
        new Response(JSON.stringify(filmMetadata), {
          headers: { "Cache-Control": "max-age=604800", "Content-Type": "application/json" },
        }),
      );

      const BANDIT_EVO_ID = 0x6acdc44d42c9679fn;
      const BR75_ID = 0x2b1824d542c9679fn;
      const rawChunk = new Uint8Array([
        ...buildFireEventBytes(1, 0, BR75_ID),
        ...buildFormulaAEventBytes(0, BANDIT_EVO_ID),
      ]);
      await defaultCache().put(
        chunkCacheRequestFor(matchId, 0),
        new Response(deflateSync(rawChunk), {
          headers: { "Cache-Control": "max-age=604800", "Content-Type": "application/octet-stream" },
        }),
      );

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 4000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 4000,
          medalValue: 0,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.entries).toHaveLength(1);
      expect(analytics.entries[0]?.weapons).toEqual([{ weaponId: "6ACDC44D42C9679F", name: "Bandit Evo", count: 1 }]);
    });

    it("propagates Formula A weapon state from a prior chunk when the kill chunk has no Formula A events", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      vi.spyOn(spartanTokenProvider, "getSpartanToken").mockResolvedValue("fake-spartan-token");
      await env.APP_DATA.put("film:clearance", "fake-clearance-token");
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));

      const killerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
      const victimXuid = unwrapXuid(Preconditions.checkExists(match.Players[1]).PlayerId);
      const matchId = match.MatchId;

      const BANDIT_EVO_ID = 0x6acdc44d42c9679fn;
      const BR75_ID = 0x2b1824d542c9679fn;

      const chunk0Raw = new Uint8Array([
        ...buildFireEventBytes(1, 0, BR75_ID),
        ...buildFormulaAEventBytes(0, BANDIT_EVO_ID),
      ]);
      await defaultCache().put(
        chunkCacheRequestFor(matchId, 0),
        new Response(deflateSync(chunk0Raw), {
          headers: { "Cache-Control": "max-age=604800", "Content-Type": "application/octet-stream" },
        }),
      );

      await defaultCache().put(
        chunkCacheRequestFor(matchId, 1),
        new Response(deflateSync(new Uint8Array(0)), {
          headers: { "Cache-Control": "max-age=604800", "Content-Type": "application/octet-stream" },
        }),
      );

      const filmMetadata = {
        AssetId: "asset-id",
        BlobStoragePathPrefix: "https://blob.example/",
        CustomData: {
          MatchId: matchId,
          FilmMajorVersion: 42,
          FilmLength: 15000,
          Chunks: [
            { Index: 0, ChunkType: 2, DurationMilliseconds: 5000, ChunkSize: 0, FileRelativePath: "/chunk-0.bin" },
            { Index: 1, ChunkType: 2, DurationMilliseconds: 10000, ChunkSize: 0, FileRelativePath: "/chunk-1.bin" },
          ],
        },
      };
      await defaultCache().put(
        metadataCacheRequestFor(matchId),
        new Response(JSON.stringify(filmMetadata), {
          headers: { "Cache-Control": "max-age=604800", "Content-Type": "application/json" },
        }),
      );

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 8000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 8000,
          medalValue: 0,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.entries).toHaveLength(1);
      expect(analytics.entries[0]?.weapons).toEqual([{ weaponId: "6ACDC44D42C9679F", name: "Bandit Evo", count: 1 }]);
    });

    it("attributes weapons from valid chunks when a later chunk fails to decompress", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      vi.spyOn(spartanTokenProvider, "getSpartanToken").mockResolvedValue("fake-spartan-token");
      await env.APP_DATA.put("film:clearance", "fake-clearance-token");
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));

      const killerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
      const victimXuid = unwrapXuid(Preconditions.checkExists(match.Players[1]).PlayerId);
      const matchId = match.MatchId;

      const BR75_ID = 0x2b1824d542c9679fn;

      await defaultCache().put(
        chunkCacheRequestFor(matchId, 0),
        new Response(deflateSync(buildFireEventBytes(0, 0, BR75_ID)), {
          headers: { "Cache-Control": "max-age=604800", "Content-Type": "application/octet-stream" },
        }),
      );

      await defaultCache().put(
        chunkCacheRequestFor(matchId, 1),
        new Response(new Uint8Array([0x01, 0x02, 0x03]), {
          headers: { "Cache-Control": "max-age=604800", "Content-Type": "application/octet-stream" },
        }),
      );

      const filmMetadata = {
        AssetId: "asset-id",
        BlobStoragePathPrefix: "https://blob.example/",
        CustomData: {
          MatchId: matchId,
          FilmMajorVersion: 42,
          FilmLength: 10000,
          Chunks: [
            { Index: 0, ChunkType: 2, DurationMilliseconds: 5000, ChunkSize: 0, FileRelativePath: "/chunk-0.bin" },
            { Index: 1, ChunkType: 2, DurationMilliseconds: 5000, ChunkSize: 0, FileRelativePath: "/chunk-1.bin" },
          ],
        },
      };
      await defaultCache().put(
        metadataCacheRequestFor(matchId),
        new Response(JSON.stringify(filmMetadata), {
          headers: { "Cache-Control": "max-age=604800", "Content-Type": "application/json" },
        }),
      );

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 3000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 3000,
          medalValue: 0,
          teamId: null,
        },
      ]);

      const analytics = await service.buildKillMatrixAnalytics(match);
      expect(analytics.entries).toHaveLength(1);
      expect(analytics.entries[0]?.weapons).toEqual([{ weaponId: "2B1824D542C9679F", name: "BR75", count: 1 }]);
    });

    it("resolves auth context only once when multiple type-2 chunks are fetched in parallel", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const getSpartanTokenSpy = vi
        .spyOn(spartanTokenProvider, "getSpartanToken")
        .mockResolvedValue("fake-spartan-token");
      await env.APP_DATA.put("film:clearance", "fake-clearance-token");
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
      const killerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
      const victimXuid = unwrapXuid(Preconditions.checkExists(match.Players[1]).PlayerId);

      const matchId = match.MatchId;
      const compressedEmpty = deflateSync(new Uint8Array(0));
      const filmMetadata = {
        AssetId: "asset-id",
        BlobStoragePathPrefix: "https://blob.example/",
        CustomData: {
          MatchId: matchId,
          FilmMajorVersion: 42,
          FilmLength: 20000,
          Chunks: [
            { Index: 0, ChunkType: 2, DurationMilliseconds: 10000, ChunkSize: 0, FileRelativePath: "/chunk-0.bin" },
            { Index: 1, ChunkType: 2, DurationMilliseconds: 10000, ChunkSize: 0, FileRelativePath: "/chunk-1.bin" },
          ],
        },
      };
      await defaultCache().put(
        metadataCacheRequestFor(matchId),
        new Response(JSON.stringify(filmMetadata), {
          headers: { "Cache-Control": "max-age=604800", "Content-Type": "application/json" },
        }),
      );

      vi.spyOn(globalThis, "fetch").mockImplementation(async (): Promise<Response> => {
        await Promise.resolve();
        return new Response(compressedEmpty, { status: 200 });
      });

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        {
          xuid: killerXuid,
          gamertag: "killer",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 4000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: victimXuid,
          gamertag: "victim",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 4000,
          medalValue: 0,
          teamId: null,
        },
      ]);

      await service.buildKillMatrixAnalytics(match);

      expect(getSpartanTokenSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("buildKillRaceProgression", () => {
    it("accumulates running scores per team in kill timestamp order", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
      const team0PlayerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
      const team1PlayerXuid = unwrapXuid(Preconditions.checkExists(match.Players[3]).PlayerId);

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        {
          xuid: team0PlayerXuid,
          gamertag: "p0",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 5000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: team1PlayerXuid,
          gamertag: "p2",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 12000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: team0PlayerXuid,
          gamertag: "p0",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 18000,
          medalValue: 0,
          teamId: null,
        },
      ]);

      const result = await service.buildKillRaceProgression(match);

      expect(result.teamCount).toBe(2);
      expect(result.events).toHaveLength(3);
      expect(result.events[0]).toEqual({ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } });
      expect(result.events[1]).toEqual({ timestampMs: 12000, teamId: 1, runningScores: { "0": 1, "1": 1 } });
      expect(result.events[2]).toEqual({ timestampMs: 18000, teamId: 0, runningScores: { "0": 2, "1": 1 } });
      expect(result.deathTimeline).toEqual([]);
    });

    it("collects deathTimeline from death events belonging to known teams", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
      const team0PlayerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);
      const team1PlayerXuid = unwrapXuid(Preconditions.checkExists(match.Players[3]).PlayerId);

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        {
          xuid: team0PlayerXuid,
          gamertag: "p0",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 5000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: team1PlayerXuid,
          gamertag: "p2",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 5001,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: "9999999999",
          gamertag: "unknown",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 6000,
          medalValue: 0,
          teamId: null,
        },
      ]);

      const result = await service.buildKillRaceProgression(match);

      expect(result.deathTimeline).toEqual([{ timestampMs: 5001, teamId: 1 }]);
    });

    it("skips kill events whose xuid is not mapped to any team in matchStats", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
      const team0PlayerXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        {
          xuid: "9999999999",
          gamertag: "unknown",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 1000,
          medalValue: 0,
          teamId: null,
        },
        {
          xuid: team0PlayerXuid,
          gamertag: "p0",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 2000,
          medalValue: 0,
          teamId: null,
        },
      ]);

      const result = await service.buildKillRaceProgression(match);

      expect(result.teamCount).toBe(2);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.timestampMs).toBe(2000);
    });

    it("returns empty events when no kill events are present", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        {
          xuid: "1111111111",
          gamertag: "p0",
          typeHint: 20,
          isMedal: false,
          eventType: "death",
          timeMs: 5000,
          medalValue: 0,
          teamId: null,
        },
      ]);

      const result = await service.buildKillRaceProgression(match);

      expect(result.teamCount).toBe(2);
      expect(result.events).toHaveLength(0);
      expect(result.deathTimeline).toEqual([]);
    });
  });

  describe("buildObjectiveControlProgression", () => {
    function modeEvent(xuid: string, timeMs: number): ParsedHighlightEvent {
      return {
        xuid,
        gamertag: "player",
        typeHint: 0,
        isMedal: false,
        eventType: "mode",
        timeMs,
        medalValue: 0,
        teamId: null,
      };
    }

    it("derives hill capture timestamps from relocation gaps and match-end event", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth"));
      const team0Xuid = "0100000000000000";
      const team1Xuid = "0400000000000000";

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        // Location A: Team 0 accumulates 5 ticks (captures, causing relocation)
        modeEvent(team0Xuid, 5000),
        modeEvent(team0Xuid, 10000),
        modeEvent(team0Xuid, 15000),
        modeEvent(team0Xuid, 20000),
        modeEvent(team0Xuid, 25000),
        // Location B: Team 1 accumulates 5 ticks (captures, causing relocation)
        modeEvent(team1Xuid, 70000),
        modeEvent(team1Xuid, 75000),
        modeEvent(team1Xuid, 80000),
        modeEvent(team1Xuid, 85000),
        modeEvent(team1Xuid, 90000),
        // Location C: Team 0 accumulates 5 ticks (captures, causing relocation)
        modeEvent(team0Xuid, 140000),
        modeEvent(team0Xuid, 145000),
        modeEvent(team0Xuid, 150000),
        modeEvent(team0Xuid, 155000),
        modeEvent(team0Xuid, 160000),
        // Location D: Team 1 accumulates 5 ticks (captures, causing relocation)
        modeEvent(team1Xuid, 220000),
        modeEvent(team1Xuid, 225000),
        modeEvent(team1Xuid, 230000),
        modeEvent(team1Xuid, 235000),
        modeEvent(team1Xuid, 240000),
        // Location E: Team 0 accumulates 5 ticks and ends the match
        modeEvent(team0Xuid, 300000),
        modeEvent(team0Xuid, 305000),
        modeEvent(team0Xuid, 310000),
        modeEvent(team0Xuid, 315000),
        modeEvent(team0Xuid, 320000),
      ]);
      vi.spyOn(service, "getStateByte2Transitions").mockResolvedValue([
        { timeMs: 25500, fromValue: 0x40, toValue: 0x41 }, // end of Location A control
        { timeMs: 30000, fromValue: 0x41, toValue: 0x42 }, // start of Location B control
        { timeMs: 90500, fromValue: 0x42, toValue: 0x43 }, // end of Location B control
        { timeMs: 95000, fromValue: 0x43, toValue: 0x44 }, // start of Location C control
        { timeMs: 160500, fromValue: 0x44, toValue: 0x45 }, // end of Location C control
        { timeMs: 165000, fromValue: 0x45, toValue: 0x46 }, // start of Location D control
        { timeMs: 240500, fromValue: 0x46, toValue: 0x47 }, // end of Location D control
        { timeMs: 245000, fromValue: 0x47, toValue: 0x48 }, // start of Location E control
      ]);

      const durationMs = 732278;
      const result = await service.buildObjectiveControlProgression(match, durationMs);

      expect(result.teamCount).toBe(2);
      expect(result.hillCaptureTimestamps).toEqual([25000, 90000, 160000, 240000, 320000]);
      expect(result.events).toHaveLength(25);
      expect(result.controlPeriods).toHaveLength(9);
    });

    it("returns empty hillCaptureTimestamps when no byte2 transitions are available", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth"));
      const team0Xuid = "0100000000000000";

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        modeEvent(team0Xuid, 5000),
        modeEvent(team0Xuid, 10000),
      ]);
      vi.spyOn(service, "getStateByte2Transitions").mockResolvedValue([]);

      const result = await service.buildObjectiveControlProgression(match, 300000);

      expect(result.hillCaptureTimestamps).toEqual([]);
      expect(result.controlPeriods).toEqual([]);
    });

    it("deduplicates mode events within 2500ms of the same team", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth"));
      const team0Xuid = "0100000000000000";
      const team1Xuid = "0400000000000000";

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        // Two Team 0 events within 2500ms — only the first counts
        modeEvent(team0Xuid, 5000),
        modeEvent(team0Xuid, 5001),
        modeEvent(team0Xuid, 10000),
        modeEvent(team0Xuid, 15000),
        modeEvent(team0Xuid, 20000),
        // Team 1 ends the match
        modeEvent(team1Xuid, 200000),
      ]);
      vi.spyOn(service, "getStateByte2Transitions").mockResolvedValue([
        { timeMs: 20500, fromValue: 0x40, toValue: 0x41 },
        { timeMs: 25000, fromValue: 0x41, toValue: 0x42 },
      ]);

      const result = await service.buildObjectiveControlProgression(match, 300000);

      expect(result.events).toHaveLength(5);
      expect(result.events[0]).toMatchObject({ timestampMs: 5000, teamId: 0 });
      expect(result.events[1]).toMatchObject({ timestampMs: 10000, teamId: 0 });
    });

    it("does not add matchEndEvent tick as a capture when all captures are already detected via relocation gaps", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      // koth.json: Eagle=3, Cobra=2 → 5 total captures
      const match = Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth"));
      const team0Xuid = "0100000000000000";
      const team1Xuid = "0400000000000000";

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        // Location A: Eagle captures (5 ticks → relocation)
        modeEvent(team0Xuid, 5000),
        modeEvent(team0Xuid, 10000),
        modeEvent(team0Xuid, 15000),
        modeEvent(team0Xuid, 20000),
        modeEvent(team0Xuid, 25000),
        // Location B: Cobra captures (5 ticks → relocation)
        modeEvent(team1Xuid, 70000),
        modeEvent(team1Xuid, 75000),
        modeEvent(team1Xuid, 80000),
        modeEvent(team1Xuid, 85000),
        modeEvent(team1Xuid, 90000),
        // Location C: Eagle captures (5 ticks → relocation)
        modeEvent(team0Xuid, 140000),
        modeEvent(team0Xuid, 145000),
        modeEvent(team0Xuid, 150000),
        modeEvent(team0Xuid, 155000),
        modeEvent(team0Xuid, 160000),
        // Location D: Cobra captures (5 ticks → relocation)
        modeEvent(team1Xuid, 220000),
        modeEvent(team1Xuid, 225000),
        modeEvent(team1Xuid, 230000),
        modeEvent(team1Xuid, 235000),
        modeEvent(team1Xuid, 240000),
        // Location E: Eagle captures (5 ticks → relocation)
        modeEvent(team0Xuid, 300000),
        modeEvent(team0Xuid, 305000),
        modeEvent(team0Xuid, 310000),
        modeEvent(team0Xuid, 315000),
        modeEvent(team0Xuid, 320000),
        // Location F: match ends on time — hill never captured, these ticks must NOT become a capture
        modeEvent(team0Xuid, 380000),
        modeEvent(team0Xuid, 385000),
      ]);
      vi.spyOn(service, "getStateByte2Transitions").mockResolvedValue([
        { timeMs: 25500, fromValue: 0x40, toValue: 0x41 },
        { timeMs: 30000, fromValue: 0x41, toValue: 0x42 },
        { timeMs: 90500, fromValue: 0x42, toValue: 0x43 },
        { timeMs: 95000, fromValue: 0x43, toValue: 0x44 },
        { timeMs: 160500, fromValue: 0x44, toValue: 0x45 },
        { timeMs: 165000, fromValue: 0x45, toValue: 0x46 },
        { timeMs: 240500, fromValue: 0x46, toValue: 0x47 },
        { timeMs: 245000, fromValue: 0x47, toValue: 0x48 },
        { timeMs: 320500, fromValue: 0x48, toValue: 0x49 }, // Location E ends → F begins
        { timeMs: 325000, fromValue: 0x49, toValue: 0x4a },
      ]);

      const result = await service.buildObjectiveControlProgression(match, 732278);

      // All 5 captures detected from relocation gaps — the 2 ticks on Location F
      // are not a capture, so matchEndEvent (385000) must NOT appear.
      expect(result.hillCaptureTimestamps).toEqual([25000, 90000, 160000, 240000, 320000]);
    });

    it("deduplicates when the last relocation capture timestamp equals the match-end event", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth"));
      const team0Xuid = "0100000000000000";

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        modeEvent(team0Xuid, 5000),
        modeEvent(team0Xuid, 10000),
        modeEvent(team0Xuid, 15000),
        modeEvent(team0Xuid, 20000),
        modeEvent(team0Xuid, 25000),
      ]);
      // Null gap starts right at the last tick — matchEndEvent.timestampMs === relocation capture timestamp
      vi.spyOn(service, "getStateByte2Transitions").mockResolvedValue([
        { timeMs: 25001, fromValue: 0x40, toValue: 0x41 },
        { timeMs: 30000, fromValue: 0x41, toValue: 0x42 },
      ]);

      const result = await service.buildObjectiveControlProgression(match, 300000);

      expect(result.hillCaptureTimestamps).toEqual([25000]);
    });

    it("ignores a null gap whose preceding control period is shorter than the minimum pre-period duration", async () => {
      // Set up 5 valid relocation captures (Eagle=3, Cobra=2 — matches koth fixture) plus a
      // spurious rapid-oscillation blip after the 5th capture. The blip creates a null gap
      // whose prePeriod is only 100ms (well below MIN_PRE_PERIOD_MS=500ms) and would otherwise
      // pass recency and perLocationTicks checks — verifying it is filtered.
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth"));
      const team0Xuid = "0100000000000000";
      const team1Xuid = "0400000000000000";

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        modeEvent(team0Xuid, 5000),
        modeEvent(team0Xuid, 10000),
        modeEvent(team0Xuid, 15000),
        modeEvent(team0Xuid, 20000),
        modeEvent(team0Xuid, 25000), // Loc A: Eagle captures
        modeEvent(team1Xuid, 70000),
        modeEvent(team1Xuid, 75000),
        modeEvent(team1Xuid, 80000),
        modeEvent(team1Xuid, 85000),
        modeEvent(team1Xuid, 90000), // Loc B: Cobra captures
        modeEvent(team0Xuid, 140000),
        modeEvent(team0Xuid, 145000),
        modeEvent(team0Xuid, 150000),
        modeEvent(team0Xuid, 155000),
        modeEvent(team0Xuid, 160000), // Loc C: Eagle captures
        modeEvent(team1Xuid, 220000),
        modeEvent(team1Xuid, 225000),
        modeEvent(team1Xuid, 230000),
        modeEvent(team1Xuid, 235000),
        modeEvent(team1Xuid, 240000), // Loc D: Cobra captures
        modeEvent(team0Xuid, 300000),
        modeEvent(team0Xuid, 305000),
        modeEvent(team0Xuid, 310000),
        modeEvent(team0Xuid, 315000),
        modeEvent(team0Xuid, 320000), // Loc E: Eagle captures
        // Rapid blip: 5 ticks inside [325100→325200ms] create a prePeriod of only 100ms.
        // Without MIN_PRE_PERIOD_MS these would produce a spurious capture at 325150ms.
        modeEvent(team0Xuid, 325110),
        modeEvent(team0Xuid, 325120),
        modeEvent(team0Xuid, 325130),
        modeEvent(team0Xuid, 325140),
        modeEvent(team0Xuid, 325150),
      ]);
      vi.spyOn(service, "getStateByte2Transitions").mockResolvedValue([
        { timeMs: 25500, fromValue: 0x40, toValue: 0x41 },
        { timeMs: 30000, fromValue: 0x41, toValue: 0x42 },
        { timeMs: 90500, fromValue: 0x42, toValue: 0x43 },
        { timeMs: 95000, fromValue: 0x43, toValue: 0x44 },
        { timeMs: 160500, fromValue: 0x44, toValue: 0x45 },
        { timeMs: 165000, fromValue: 0x45, toValue: 0x46 },
        { timeMs: 240500, fromValue: 0x46, toValue: 0x47 },
        { timeMs: 245000, fromValue: 0x47, toValue: 0x48 },
        { timeMs: 320500, fromValue: 0x48, toValue: 0x49 },
        { timeMs: 325000, fromValue: 0x49, toValue: 0x4a },
        // Blip: occupied [325100→325200ms] = 100ms prePeriod — filtered by MIN_PRE_PERIOD_MS
        { timeMs: 325100, fromValue: 0x4a, toValue: 0x4b },
        { timeMs: 325200, fromValue: 0x4b, toValue: 0x4a },
      ]);

      const result = await service.buildObjectiveControlProgression(match, 732278);

      expect(result.hillCaptureTimestamps).toEqual([25000, 90000, 160000, 240000, 320000]);
    });

    it("attributes a relocation capture to the team with the most recent tick even when the other team majority-controlled the period", async () => {
      // Hill 1: Team 1 has 7 ticks (majority in the occupied period), Team 0 has 6 ticks
      // including the final tick at 49000ms (most recent before the gap at 50000ms).
      // Events are spaced 3000ms apart to avoid the 2500ms dedup window.
      // The capture should be attributed to Team 0 (most-recent-tick-wins), not Team 1.
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth"));
      const team0Xuid = "0100000000000000";
      const team1Xuid = "0400000000000000";

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([
        // Hill 1: T0=6 ticks (3000ms spacing), T1=7 ticks (3000ms spacing), T0 last tick at 49000ms
        modeEvent(team0Xuid, 5000),
        modeEvent(team0Xuid, 8000),
        modeEvent(team0Xuid, 11000),
        modeEvent(team0Xuid, 14000),
        modeEvent(team0Xuid, 17000),
        modeEvent(team1Xuid, 18500),
        modeEvent(team1Xuid, 21500),
        modeEvent(team1Xuid, 24500),
        modeEvent(team1Xuid, 27500),
        modeEvent(team1Xuid, 30500),
        modeEvent(team1Xuid, 33500),
        modeEvent(team1Xuid, 36500),
        modeEvent(team0Xuid, 49000), // most recent tick before gap at 50000ms
        // Hills 2–5 (single-team, 3000ms spacing, Eagle=3 total, Cobra=2 total)
        modeEvent(team1Xuid, 100000),
        modeEvent(team1Xuid, 103000),
        modeEvent(team1Xuid, 106000),
        modeEvent(team1Xuid, 109000),
        modeEvent(team1Xuid, 112000), // Hill 2: Cobra
        modeEvent(team0Xuid, 160000),
        modeEvent(team0Xuid, 163000),
        modeEvent(team0Xuid, 166000),
        modeEvent(team0Xuid, 169000),
        modeEvent(team0Xuid, 172000), // Hill 3: Eagle
        modeEvent(team1Xuid, 220000),
        modeEvent(team1Xuid, 223000),
        modeEvent(team1Xuid, 226000),
        modeEvent(team1Xuid, 229000),
        modeEvent(team1Xuid, 232000), // Hill 4: Cobra
        modeEvent(team0Xuid, 280000),
        modeEvent(team0Xuid, 283000),
        modeEvent(team0Xuid, 286000),
        modeEvent(team0Xuid, 289000),
        modeEvent(team0Xuid, 292000), // Hill 5: Eagle
      ]);
      vi.spyOn(service, "getStateByte2Transitions").mockResolvedValue([
        { timeMs: 5000, fromValue: 0x40, toValue: 0x41 },
        { timeMs: 50000, fromValue: 0x41, toValue: 0x42 },
        { timeMs: 95000, fromValue: 0x42, toValue: 0x43 },
        { timeMs: 115000, fromValue: 0x43, toValue: 0x44 },
        { timeMs: 155000, fromValue: 0x44, toValue: 0x45 },
        { timeMs: 175000, fromValue: 0x45, toValue: 0x46 },
        { timeMs: 215000, fromValue: 0x46, toValue: 0x47 },
        { timeMs: 235000, fromValue: 0x47, toValue: 0x48 },
        { timeMs: 275000, fromValue: 0x48, toValue: 0x49 },
        { timeMs: 295000, fromValue: 0x49, toValue: 0x4a },
      ]);

      const result = await service.buildObjectiveControlProgression(match, 732278);

      // hillCaptureTimestamps[0] must be 49000ms (T0's last tick) not 36500ms (T1's last tick),
      // proving the most-recent-tick-wins logic rather than majority-period-team wins.
      expect(result.hillCaptureTimestamps).toEqual([49000, 112000, 172000, 232000, 292000]);
    });

    it("returns empty when no mode events are present", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth"));

      vi.spyOn(service, "getHighlightEventsForMatch").mockResolvedValue([]);
      vi.spyOn(service, "getStateByte2Transitions").mockResolvedValue([
        { timeMs: 100000, fromValue: 0x40, toValue: 0x41 },
      ]);

      const result = await service.buildObjectiveControlProgression(match, 300000);

      expect(result.hillCaptureTimestamps).toEqual([]);
      expect(result.events).toHaveLength(0);
    });
  });

  describe("highlight events KV cache", () => {
    it("returns KV-cached events without hitting the network", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      vi.spyOn(spartanTokenProvider, "getSpartanToken").mockResolvedValue("test-spartan-token");
      const service = new HaloFilmService({ env, spartanTokenProvider });

      const cachedEvents: ParsedHighlightEvent[] = [
        {
          xuid: "111",
          gamertag: "cached-player",
          typeHint: 50,
          isMedal: false,
          eventType: "kill",
          timeMs: 500,
          medalValue: 0,
          teamId: null,
        },
      ];
      await env.APP_DATA.put("halo:film:match:kv-match-1", JSON.stringify(cachedEvents));

      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const events = await service.getHighlightEventsForMatch("kv-match-1");

      expect(events).toEqual(cachedEvents);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("stores parsed events in KV after fetching from Halo Waypoint", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      vi.spyOn(spartanTokenProvider, "getSpartanToken").mockResolvedValue("test-spartan-token");
      await env.APP_DATA.put("film:clearance", "test-clearance-token");
      const service = new HaloFilmService({ env, spartanTokenProvider });

      const compressedChunk = deflateSync(Uint8Array.of(0x01, 0x02));
      const metadata = {
        AssetId: "asset-id",
        BlobStoragePathPrefix: "https://blob.example/",
        CustomData: {
          MatchId: "kv-miss-match",
          FilmMajorVersion: 42,
          FilmLength: 100,
          Chunks: [
            {
              Index: 1,
              ChunkType: 3,
              DurationMilliseconds: 100,
              ChunkSize: compressedChunk.byteLength,
              FileRelativePath: "/chunk.bin",
            },
          ],
        },
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(
        async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
          await Promise.resolve();
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          if (url.includes("/spectate")) {
            return new Response(JSON.stringify(metadata), { status: 200 });
          }
          return new Response(compressedChunk, { status: 200 });
        },
      );

      await service.getHighlightEventsForMatch("kv-miss-match");

      const stored = await env.APP_DATA.get("halo:film:match:kv-miss-match", "json");
      expect(stored).not.toBeNull();
      expect(Array.isArray(stored)).toBe(true);
    });

    it("serves second request from KV without additional network calls", async () => {
      const env = aFakeCacheBackedEnvWith();
      const xboxService = aFakeXboxServiceWith({ env });
      const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
      vi.spyOn(spartanTokenProvider, "getSpartanToken").mockResolvedValue("test-spartan-token");
      await env.APP_DATA.put("film:clearance", "test-clearance-token");
      const service = new HaloFilmService({ env, spartanTokenProvider });

      const compressedChunk = deflateSync(Uint8Array.of(0x01));
      const metadata = {
        AssetId: "asset-id",
        BlobStoragePathPrefix: "https://blob.example/",
        CustomData: {
          MatchId: "kv-second-req",
          FilmMajorVersion: 42,
          FilmLength: 100,
          Chunks: [
            {
              Index: 2,
              ChunkType: 3,
              DurationMilliseconds: 100,
              ChunkSize: compressedChunk.byteLength,
              FileRelativePath: "/chunk.bin",
            },
          ],
        },
      };

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
          await Promise.resolve();
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          if (url.includes("/spectate")) {
            return new Response(JSON.stringify(metadata), { status: 200 });
          }
          return new Response(compressedChunk, { status: 200 });
        });

      const firstResult = await service.getHighlightEventsForMatch("kv-second-req");
      const callsAfterFirst = fetchSpy.mock.calls.length;
      fetchSpy.mockClear();

      const secondResult = await service.getHighlightEventsForMatch("kv-second-req");

      expect(secondResult).toEqual(firstResult);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(callsAfterFirst).toBeGreaterThan(0);
    });
  });
});
