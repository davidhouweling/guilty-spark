import { describe, beforeEach, it, expect, vi } from "vitest";
import { NeatQueueService } from "../neatqueue.mjs";
import type { DatabaseService } from "../../database/database.mjs";
import { aFakeDatabaseServiceWith, aFakeNeatQueueConfigRow } from "../../database/fakes/database.fake.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";
import type { LogService } from "../../log/types.mjs";
import type { DiscordService } from "../../discord/discord.mjs";
import type { HaloService } from "../../halo/halo.mjs";
import { aFakeDiscordServiceWith } from "../../discord/fakes/discord.fake.mjs";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import type { NeatQueueConfigRow } from "../../database/types/neat_queue_config.mjs";

describe("NeatQueueService", () => {
  let env: Env;
  let logService: LogService;
  let databaseService: DatabaseService;
  let discordService: DiscordService;
  let haloService: HaloService;
  let neatQueueService: NeatQueueService;

  beforeEach(() => {
    env = aFakeEnvWith();
    logService = aFakeLogServiceWith();
    databaseService = aFakeDatabaseServiceWith();
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
    neatQueueService = new NeatQueueService({
      env,
      logService,
      databaseService,
      discordService,
      haloService,
    });
  });

  describe("hashAuthorizationKey", () => {
    it("hashes the authorization key", () => {
      const key = "testKey";
      const guildId = "testGuildId";
      const hashedKey = neatQueueService.hashAuthorizationKey(key, guildId);
      expect(hashedKey).toMatchInlineSnapshot(`"efc1e2914df1e04a9ede085bdff142fd3978a5698ae3dfb8fdee8c3090d24b3a"`);
    });
  });

  describe("verifyRequest", () => {
    let request: Request;

    beforeEach(() => {
      request = new Request("https://example.com", {
        method: "POST",
        headers: new Headers({ authorization: "Bearer test" }),
        body: JSON.stringify({ type: "neatqueue", GuildId: "guild-1", ChannelId: "channel-1" }),
      });
    });

    it("returns isValid: true and includes interaction and config when valid", async () => {
      const fakeConfig = aFakeNeatQueueConfigRow({
        GuildId: "guild-1",
        ChannelId: "channel-1",
        WebhookSecret: "hashed-secret",
      });
      const expectedFindConfig: Partial<NeatQueueConfigRow> = { GuildId: "guild-1", WebhookSecret: "hashed-secret" };
      const findConfigSpy = vi.spyOn(databaseService, "findNeatQueueConfig").mockResolvedValue([fakeConfig]);
      vi.spyOn(neatQueueService, "hashAuthorizationKey").mockReturnValue("hashed-secret");

      const result = await neatQueueService.verifyRequest(request);

      expect(findConfigSpy).toHaveBeenCalledWith(expectedFindConfig);
      expect(result).toEqual({
        isValid: true,
        interaction: { type: "neatqueue", GuildId: "guild-1", ChannelId: "channel-1" },
        neatQueueConfig: fakeConfig,
      });
    });

    it("returns isValid: false and error when Authorization header is missing", async () => {
      request.headers.delete("authorization");

      const result = await neatQueueService.verifyRequest(request);

      expect(result).toEqual({ isValid: false, error: "Missing Authorization header" });
    });

    it("returns isValid: false and error when request body is invalid JSON", async () => {
      request = new Request("https://example.com", {
        method: "POST",
        headers: new Headers({ authorization: "Bearer test" }),
        body: "not-json",
      });

      const result = await neatQueueService.verifyRequest(request);

      expect(result).toEqual({ isValid: false, error: "Invalid JSON" });
    });

    it("returns isValid: false when config is not found", async () => {
      vi.spyOn(databaseService, "findNeatQueueConfig").mockResolvedValue([]);

      const result = await neatQueueService.verifyRequest(request);

      expect(result).toEqual({ isValid: false });
    });
  });
});
