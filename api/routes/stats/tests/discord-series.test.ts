import type { AutoRouterType } from "itty-router";
import { EmbedType } from "discord-api-types/v10";
import type { APIEmbed, APIMessage } from "discord-api-types/v10";
import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DiscordSeriesStatsResolved,
  DiscordSeriesStatsResponse,
} from "@guilty-spark/shared/contracts/stats/discord-series";
import { createApiRouter } from "../../../base/router";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { EmbedColors } from "../../../embeds/colors";
import { DiscordError } from "../../../services/discord/discord-error";
import { guild } from "../../../services/discord/fakes/data";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { statsRoutesRegisterHandler } from "../stats";

function aFakeMessageWith(opts: {
  id: string;
  channelId?: string;
  color: number;
  title: string;
  gameFieldValue?: string;
  authorId?: string;
}): APIMessage {
  const fields = opts.gameFieldValue != null ? [{ name: "Game", value: opts.gameFieldValue, inline: true }] : [];
  const embed: APIEmbed = {
    type: EmbedType.Rich,
    color: opts.color,
    title: opts.title,
    fields,
  };

  return {
    id: opts.id,
    channel_id: opts.channelId ?? "chan-1",
    guild_id: "123456789012345678",
    content: "",
    timestamp: new Date().toISOString(),
    edited_timestamp: null,
    tts: false,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [embed],
    pinned: false,
    type: 0,
    flags: 0,
    components: [],
    author: {
      id: opts.authorId ?? "DISCORD_APP_ID",
      username: "guilty-spark",
      discriminator: "0001",
      avatar: null,
      global_name: null,
      bot: true,
    },
  } as unknown as APIMessage;
}

function aFakeRenderDataWith(matchIds: string[]): DiscordSeriesStatsResolved["renderData"] {
  return {
    title: "Queue #7777 Series Stats",
    subtitle: "Guild 123456789012345678",
    seriesScore: "1:0",
    teams: [
      { name: "Eagle", players: ["Player One"] },
      { name: "Cobra", players: ["Player Two"] },
    ],
    matches: matchIds.map((matchId, index) => ({
      matchId,
      gameTypeAndMap: "Slayer: Live Fire",
      gameVariantCategory: 0,
      gameType: "Slayer",
      gameMap: "Live Fire",
      gameMapThumbnailUrl: "data:,",
      duration: "10m 00s",
      gameScore: "50:45",
      gameSubScore: null,
      startTime: new Date(`2026-01-01T00:0${index.toString()}:00.000Z`).toISOString(),
      endTime: new Date(`2026-01-01T00:1${index.toString()}:00.000Z`).toISOString(),
      playerXuidToGametag: {},
      rawMatch: {},
    })),
  };
}

describe("/api/stats/discord/:guildId/:queueNumber", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("returns resolved payload when a blue overview embed with match ids exists", async () => {
    const ctfMatchId = "d81554d7-ddfe-44da-a6cb-000000000ctf";
    const slayerMatchId = "9535b946-f30c-4a43-b852-000000slayer";
    const matchIds = [ctfMatchId, slayerMatchId];

    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "searchGuildMessages").mockResolvedValue({
        doing_deep_historical_index: false,
        total_results: 1,
        messages: [
          [
            aFakeMessageWith({
              id: "m-1",
              color: EmbedColors.INFO,
              title: "Series stats for queue #7777 (2-1)",
              gameFieldValue: `[CTF](https://halodatahive.com/Infinite/Match/${ctfMatchId})\n[Slayer](https://halodatahive.com/Infinite/Match/${slayerMatchId})`,
            }),
          ],
        ],
      });
      vi.spyOn(services.discordService, "getGuild").mockResolvedValue({
        ...guild,
        id: "123456789012345678",
        name: "NeatQueue League",
      });
      return services;
    });
    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777"),
      env,
    )) as Response;

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=86400, stale-while-revalidate=300");
    const body = await res.json<DiscordSeriesStatsResponse>();
    expect(body).toMatchObject({
      status: "resolved",
      guildId: "123456789012345678",
      queueNumber: 7777,
      matchIds,
      renderData: {
        title: "Queue #7777 Series Stats",
        subtitle: "NeatQueue League",
      },
    });
  });

  it("falls back to guild id subtitle when guild lookup fails", async () => {
    const matchId = "d81554d7-ddfe-44da-a6cb-000000000ctf";

    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "searchGuildMessages").mockResolvedValue({
        doing_deep_historical_index: false,
        total_results: 1,
        messages: [
          [
            aFakeMessageWith({
              id: "m-guild-fallback",
              color: EmbedColors.INFO,
              title: "Series stats for queue #7777 (1-0)",
              gameFieldValue: `[Slayer](https://halodatahive.com/Infinite/Match/${matchId})`,
            }),
          ],
        ],
      });
      vi.spyOn(services.discordService, "getGuild").mockRejectedValue(new Error("guild fetch failed"));
      return services;
    });
    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777"),
      env,
    )) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<DiscordSeriesStatsResponse>();
    expect(body).toMatchObject({
      status: "resolved",
      guildId: "123456789012345678",
      queueNumber: 7777,
      matchIds: [matchId],
      renderData: {
        title: "Queue #7777 Series Stats",
        subtitle: "Guild 123456789012345678",
      },
    });
  });

  it("returns pending-index when Discord search indicates indexing delay", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "searchGuildMessages").mockResolvedValue({
        code: 110000,
        documents_indexed: 0,
        retry_after: 3,
        message: "Index not yet available. Try again later",
      });
      return services;
    });
    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777"),
      env,
    )) as Response;

    expect(res.status).toBe(503);
    const body = await res.json<DiscordSeriesStatsResponse>();
    expect(body).toEqual({
      status: "pending-index",
      guildId: "123456789012345678",
      queueNumber: 7777,
      retryAfterSeconds: 3,
    });
  });

  it("returns cached response without calling Discord search", async () => {
    const storedByKey = new Map<string, string>();
    const appDataGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
    const appDataPutSpy: MockInstance<(key: string, value: string, options?: KVNamespacePutOptions) => Promise<void>> =
      vi.spyOn(env.APP_DATA, "put");

    appDataGetSpy.mockImplementation(async (key: string, options?: { type?: string }) => {
      await Promise.resolve();
      const value = storedByKey.get(key);
      if (value == null) {
        return null;
      }

      if (options?.type === "json") {
        return JSON.parse(value) as unknown;
      }

      return value;
    });
    appDataPutSpy.mockImplementation(async (key: string, value: string) => {
      await Promise.resolve();
      storedByKey.set(key, value);
    });

    const cacheKey = "stats:discord:series:123456789012345678:7777";
    await env.APP_DATA.put(
      cacheKey,
      JSON.stringify({
        status: "resolved",
        guildId: "123456789012345678",
        queueNumber: 7777,
        matchIds: ["cached-match-1"],
        renderData: aFakeRenderDataWith(["cached-match-1"]),
      }),
    );

    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      const searchSpy = vi.spyOn(services.discordService, "searchGuildMessages");
      searchSpy.mockImplementation(() => {
        throw new Error("searchGuildMessages should not be called when cache hit exists");
      });
      return services;
    });

    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777"),
      env,
    )) as Response;

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=86400, stale-while-revalidate=300");
    const body = await res.json<DiscordSeriesStatsResponse>();
    expect(body).toEqual({
      status: "resolved",
      guildId: "123456789012345678",
      queueNumber: 7777,
      matchIds: ["cached-match-1"],
      renderData: aFakeRenderDataWith(["cached-match-1"]),
    });
    expect(appDataGetSpy).toHaveBeenCalledWith(cacheKey, { type: "json" });
  });

  it("returns cached pending-index response with Retry-After and no-store headers", async () => {
    const storedByKey = new Map<string, string>();
    const appDataGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
    const appDataPutSpy: MockInstance<(key: string, value: string, options?: KVNamespacePutOptions) => Promise<void>> =
      vi.spyOn(env.APP_DATA, "put");

    appDataGetSpy.mockImplementation(async (key: string, options?: { type?: string }) => {
      await Promise.resolve();
      const value = storedByKey.get(key);
      if (value == null) {
        return null;
      }

      if (options?.type === "json") {
        return JSON.parse(value) as unknown;
      }

      return value;
    });
    appDataPutSpy.mockImplementation(async (key: string, value: string) => {
      await Promise.resolve();
      storedByKey.set(key, value);
    });

    const cacheKey = "stats:discord:series:123456789012345678:7777";
    await env.APP_DATA.put(
      cacheKey,
      JSON.stringify({
        status: "pending-index",
        guildId: "123456789012345678",
        queueNumber: 7777,
        retryAfterSeconds: 3,
      }),
    );

    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      const searchSpy = vi.spyOn(services.discordService, "searchGuildMessages");
      searchSpy.mockImplementation(() => {
        throw new Error("searchGuildMessages should not be called when cache hit exists");
      });
      return services;
    });

    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777"),
      env,
    )) as Response;

    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("3");
    expect(res.headers.get("cache-control")).toBe("no-store");

    const body = await res.json<DiscordSeriesStatsResponse>();
    expect(body).toEqual({
      status: "pending-index",
      guildId: "123456789012345678",
      queueNumber: 7777,
      retryAfterSeconds: 3,
    });
    expect(appDataGetSpy).toHaveBeenCalledWith(cacheKey, { type: "json" });
  });

  it("treats invalid cached payload as cache miss and resolves via Discord search", async () => {
    const matchId = "d81554d7-ddfe-44da-a6cb-000000000ctf";

    const appDataGetSpy: MockInstance<typeof env.APP_DATA.get> = vi.spyOn(env.APP_DATA, "get");
    appDataGetSpy.mockResolvedValue(new Map<string, unknown>());

    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "searchGuildMessages").mockResolvedValue({
        doing_deep_historical_index: false,
        total_results: 1,
        messages: [
          [
            aFakeMessageWith({
              id: "m-after-invalid-cache",
              color: EmbedColors.INFO,
              title: "Series stats for queue #7777",
              gameFieldValue: `[Slayer](https://halodatahive.com/Infinite/Match/${matchId})`,
            }),
          ],
        ],
      });
      return services;
    });
    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777"),
      env,
    )) as Response;

    expect(res.status).toBe(200);
    const body = await res.json<DiscordSeriesStatsResponse>();
    expect(body).toMatchObject({
      status: "resolved",
      guildId: "123456789012345678",
      queueNumber: 7777,
      matchIds: [matchId],
      renderData: {
        title: "Queue #7777 Series Stats",
      },
    });
  });

  it("returns not-found when no blue overview embeds are found", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "searchGuildMessages").mockResolvedValue({
        doing_deep_historical_index: false,
        total_results: 1,
        messages: [[aFakeMessageWith({ id: "m-err", color: 0xff0000, title: "Error occurred" })]],
      });
      return services;
    });
    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777"),
      env,
    )) as Response;

    expect(res.status).toBe(404);
    const body = await res.json<DiscordSeriesStatsResponse>();
    expect(body.status).toBe("not-found");
  });

  it("returns not-found when overview embed has no match ids", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "searchGuildMessages").mockResolvedValue({
        doing_deep_historical_index: false,
        total_results: 1,
        messages: [
          [aFakeMessageWith({ id: "m-no-match-ids", color: EmbedColors.INFO, title: "Series stats for queue #7777" })],
        ],
      });
      return services;
    });
    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777"),
      env,
    )) as Response;

    expect(res.status).toBe(404);
    const body = await res.json<DiscordSeriesStatsResponse>();
    expect(body).toEqual({
      status: "not-found",
      guildId: "123456789012345678",
      queueNumber: 7777,
      reason: "Series overview embed found but no match IDs were discoverable",
    });
  });

  it("returns forbidden when Discord service throws 403", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "searchGuildMessages").mockRejectedValue(
        new DiscordError(403, { code: 50013, message: "Missing Permissions" }),
      );
      return services;
    });
    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777"),
      env,
    )) as Response;

    expect(res.status).toBe(403);
    const body = await res.json<DiscordSeriesStatsResponse>();
    expect(body).toEqual({
      status: "forbidden",
      guildId: "123456789012345678",
      queueNumber: 7777,
      reason: "Missing Discord permissions or message content access",
    });
  });

  it("returns pending-index when Discord service throws 429", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "searchGuildMessages").mockRejectedValue(
        new DiscordError(429, {
          code: 0,
          message: "You are being rate limited.",
        }),
      );
      return services;
    });
    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777"),
      env,
    )) as Response;

    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("2");
    expect(res.headers.get("cache-control")).toBe("no-store");

    const body = await res.json<DiscordSeriesStatsResponse>();
    expect(body).toEqual({
      status: "pending-index",
      guildId: "123456789012345678",
      queueNumber: 7777,
      retryAfterSeconds: 2,
    });
  });

  it("returns internal error response when Discord search fails unexpectedly", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "searchGuildMessages").mockRejectedValue(new Error("boom"));
      return services;
    });
    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777"),
      env,
    )) as Response;

    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: "Failed to resolve discord series stats",
    });
  });

  it("returns internal error response when render data build fails", async () => {
    const matchId = "d81554d7-ddfe-44da-a6cb-000000000ctf";

    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "searchGuildMessages").mockResolvedValue({
        doing_deep_historical_index: false,
        total_results: 1,
        messages: [
          [
            aFakeMessageWith({
              id: "m-render-failure",
              color: EmbedColors.INFO,
              title: "Series stats for queue #7777",
              gameFieldValue: `[Slayer](https://halodatahive.com/Infinite/Match/${matchId})`,
            }),
          ],
        ],
      });
      vi.spyOn(services.haloService, "getMatchDetails").mockResolvedValue([]);
      return services;
    });
    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777"),
      env,
    )) as Response;

    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: "Failed to resolve discord series stats",
    });
  });
});

describe("/api/stats/discord/:guildId/:queueNumber/lookup", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("returns resolved lookup quickly without calling halo match detail lookups", async () => {
    const matchId = "d81554d7-ddfe-44da-a6cb-000000000ctf";
    let haloGetMatchDetailsSpy: MockInstance | null = null;

    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      haloGetMatchDetailsSpy = vi.spyOn(services.haloService, "getMatchDetails");
      vi.spyOn(services.discordService, "searchGuildMessages").mockResolvedValue({
        doing_deep_historical_index: false,
        total_results: 1,
        messages: [
          [
            aFakeMessageWith({
              id: "m-lookup",
              color: EmbedColors.INFO,
              title: "Series stats for queue #7777",
              gameFieldValue: `[Slayer](https://halodatahive.com/Infinite/Match/${matchId})`,
            }),
          ],
        ],
      });
      return services;
    });

    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777/lookup"),
      env,
    )) as Response;

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "resolved",
      guildId: "123456789012345678",
      queueNumber: 7777,
      matchIds: [matchId],
    });
    expect(haloGetMatchDetailsSpy).not.toBeNull();
    expect(haloGetMatchDetailsSpy).not.toHaveBeenCalled();
  });

  it("returns not found when no matching overview embed exists", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "searchGuildMessages").mockResolvedValue({
        doing_deep_historical_index: false,
        total_results: 1,
        messages: [[aFakeMessageWith({ id: "m-lookup-404", color: 0xff0000, title: "Error" })]],
      });
      return services;
    });

    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777/lookup"),
      env,
    )) as Response;

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      status: "not-found",
      guildId: "123456789012345678",
      queueNumber: 7777,
      reason: "No matching series overview embeds found",
    });
  });

  it("returns pending-index with Retry-After when Discord search is indexing", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "searchGuildMessages").mockResolvedValue({
        code: 110000,
        documents_indexed: 0,
        retry_after: 6,
        message: "Index not yet available. Try again later",
      });
      return services;
    });

    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777/lookup"),
      env,
    )) as Response;

    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("6");
  });

  it("returns cached lookup response without calling Discord search", async () => {
    const storedByKey = new Map<string, string>();
    const appDataGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
    const appDataPutSpy: MockInstance<(key: string, value: string, options?: KVNamespacePutOptions) => Promise<void>> =
      vi.spyOn(env.APP_DATA, "put");

    appDataGetSpy.mockImplementation(async (key: string, options?: { type?: string }) => {
      await Promise.resolve();
      const value = storedByKey.get(key);
      if (value == null) {
        return null;
      }

      if (options?.type === "json") {
        return JSON.parse(value) as unknown;
      }

      return value;
    });
    appDataPutSpy.mockImplementation(async (key: string, value: string) => {
      await Promise.resolve();
      storedByKey.set(key, value);
    });

    const cacheKey = "stats:discord:series:123456789012345678:7777";
    await env.APP_DATA.put(
      cacheKey,
      JSON.stringify({
        status: "resolved",
        guildId: "123456789012345678",
        queueNumber: 7777,
        matchIds: ["cached-match-1"],
        renderData: aFakeRenderDataWith(["cached-match-1"]),
      }),
    );

    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      const searchSpy = vi.spyOn(services.discordService, "searchGuildMessages");
      searchSpy.mockImplementation(() => {
        throw new Error("searchGuildMessages should not be called when lookup cache hit exists");
      });
      return services;
    });

    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777/lookup"),
      env,
    )) as Response;

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "resolved",
      guildId: "123456789012345678",
      queueNumber: 7777,
      matchIds: ["cached-match-1"],
    });
    expect(appDataGetSpy).toHaveBeenCalledWith(cacheKey, { type: "json" });
  });

  it("returns cached lookup-only response without calling Discord search", async () => {
    const storedByKey = new Map<string, string>();
    const appDataGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
    const appDataPutSpy: MockInstance<(key: string, value: string, options?: KVNamespacePutOptions) => Promise<void>> =
      vi.spyOn(env.APP_DATA, "put");

    appDataGetSpy.mockImplementation(async (key: string, options?: { type?: string }) => {
      await Promise.resolve();
      const value = storedByKey.get(key);
      if (value == null) {
        return null;
      }

      if (options?.type === "json") {
        return JSON.parse(value) as unknown;
      }

      return value;
    });
    appDataPutSpy.mockImplementation(async (key: string, value: string) => {
      await Promise.resolve();
      storedByKey.set(key, value);
    });

    const lookupCacheKey = "stats:discord:series:123456789012345678:7777:lookup";
    await env.APP_DATA.put(
      lookupCacheKey,
      JSON.stringify({
        status: "lookup-resolved",
        guildId: "123456789012345678",
        queueNumber: 7777,
        matchIds: ["cached-match-lookup-1"],
      }),
    );

    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      const searchSpy = vi.spyOn(services.discordService, "searchGuildMessages");
      searchSpy.mockImplementation(() => {
        throw new Error("searchGuildMessages should not be called when lookup cache hit exists");
      });
      return services;
    });

    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777/lookup"),
      env,
    )) as Response;

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "resolved",
      guildId: "123456789012345678",
      queueNumber: 7777,
      matchIds: ["cached-match-lookup-1"],
    });
    expect(appDataGetSpy).toHaveBeenCalledWith("stats:discord:series:123456789012345678:7777", { type: "json" });
    expect(appDataGetSpy).toHaveBeenCalledWith(lookupCacheKey, { type: "json" });
  });

  it("treats invalid cached lookup-only payload as cache miss", async () => {
    const storedByKey = new Map<string, string>();
    const appDataGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
    const appDataPutSpy: MockInstance<(key: string, value: string, options?: KVNamespacePutOptions) => Promise<void>> =
      vi.spyOn(env.APP_DATA, "put");

    appDataGetSpy.mockImplementation(async (key: string, options?: { type?: string }) => {
      await Promise.resolve();
      const value = storedByKey.get(key);
      if (value == null) {
        return null;
      }

      if (options?.type === "json") {
        return JSON.parse(value) as unknown;
      }

      return value;
    });
    appDataPutSpy.mockImplementation(async (key: string, value: string) => {
      await Promise.resolve();
      storedByKey.set(key, value);
    });

    const matchId = "d81554d7-ddfe-44da-a6cb-000000000ctf";
    const lookupCacheKey = "stats:discord:series:123456789012345678:7777:lookup";
    await env.APP_DATA.put(
      lookupCacheKey,
      JSON.stringify({
        status: "lookup-resolved",
        guildId: "123456789012345678",
        queueNumber: 7777,
        matchIds: [123],
      }),
    );

    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "searchGuildMessages").mockResolvedValue({
        doing_deep_historical_index: false,
        total_results: 1,
        messages: [
          [
            aFakeMessageWith({
              id: "m-lookup-invalid-cache",
              color: EmbedColors.INFO,
              title: "Series stats for queue #7777",
              gameFieldValue: `[Slayer](https://halodatahive.com/Infinite/Match/${matchId})`,
            }),
          ],
        ],
      });
      return services;
    });

    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777/lookup"),
      env,
    )) as Response;

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "resolved",
      guildId: "123456789012345678",
      queueNumber: 7777,
      matchIds: [matchId],
    });
    expect(appDataGetSpy).toHaveBeenCalledWith("stats:discord:series:123456789012345678:7777", { type: "json" });
    expect(appDataGetSpy).toHaveBeenCalledWith(lookupCacheKey, { type: "json" });
  });

  it("returns forbidden when Discord service throws 403", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "searchGuildMessages").mockRejectedValue(
        new DiscordError(403, { code: 50013, message: "Missing Permissions" }),
      );
      return services;
    });

    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777/lookup"),
      env,
    )) as Response;

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      status: "forbidden",
      guildId: "123456789012345678",
      queueNumber: 7777,
      reason: "Missing Discord permissions or message content access",
    });
  });

  it("returns pending-index when Discord service throws 429", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "searchGuildMessages").mockRejectedValue(
        new DiscordError(429, {
          code: 0,
          message: "You are being rate limited.",
        }),
      );
      return services;
    });

    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777/lookup"),
      env,
    )) as Response;

    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("2");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      status: "pending-index",
      guildId: "123456789012345678",
      queueNumber: 7777,
      retryAfterSeconds: 2,
    });
  });

  it("returns internal error response when lookup fails unexpectedly", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "searchGuildMessages").mockRejectedValue(new Error("boom"));
      return services;
    });

    statsRoutesRegisterHandler(router, localInstallServices);

    const res = (await router.fetch(
      new Request("http://localhost/api/stats/discord/123456789012345678/7777/lookup"),
      env,
    )) as Response;

    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: "Failed to resolve discord series stats lookup",
    });
  });
});
