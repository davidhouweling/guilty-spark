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

function buildSingleFireEventBytes(playerIndex: number, slot: number, weaponId: bigint): Uint8Array {
  const MARKER_BITS = 0b10100100110;
  const data = new Uint8Array(15); // 120 bits — scanner needs 115 minimum

  function setBit(bitPos: number): void {
    const byteIdx = (bitPos / 8) | 0;
    const bitIdx = 7 - (bitPos % 8);
    data[byteIdx] = (data[byteIdx] ?? 0) | (1 << bitIdx);
  }

  for (let i = 0; i < 11; i++) {
    if ((MARKER_BITS >> (10 - i)) & 1) {
      setBit(i);
    }
  }
  const b5 = (playerIndex << 4) | slot;
  for (let i = 0; i < 8; i++) {
    if ((b5 >> (7 - i)) & 1) {
      setBit(35 + i);
    }
  }
  for (let i = 0; i < 64; i++) {
    if ((weaponId >> BigInt(63 - i)) & 1n) {
      setBit(43 + i);
    }
  }
  return data;
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
      vi.spyOn(spartanTokenProvider, "getSpartanToken").mockResolvedValue("fake-spartan-token");
      await env.APP_DATA.put("film:clearance", "fake-clearance-token");
      const service = new HaloFilmService({ env, spartanTokenProvider });
      const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));

      // After sort by (LastTeamId ASC, Rank ASC): Players[2] (xuid 0500…, LastTeamId=0, Rank=5) → playerIndex 0
      const killerXuid = unwrapXuid(Preconditions.checkExists(match.Players[2]).PlayerId);
      const victimXuid = unwrapXuid(Preconditions.checkExists(match.Players[0]).PlayerId);

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

      // Build a 15-byte type-2 chunk with a single BR75 fire event for playerIndex=0.
      // Layout: 11-bit universal marker at [0..10], b5=(playerIndex<<4|slot) at [35..42],
      //         weapon_id (64-bit big-endian) at [43..106].
      const BR75_WEAPON_ID = 0x2b1824d542c9679fn;
      const fireEventBytes = buildSingleFireEventBytes(0, 0, BR75_WEAPON_ID);
      await defaultCache().put(
        chunkCacheRequestFor(matchId, 0),
        new Response(fireEventBytes, {
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
