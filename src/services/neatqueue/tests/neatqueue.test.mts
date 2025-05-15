import { describe, beforeEach, it, expect } from "vitest";
import { NeatQueueService } from "../neatqueue.mjs";
import type { DatabaseService } from "../../database/database.mjs";
import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";
import type { LogService } from "../../log/types.mjs";
import type { DiscordService } from "../../discord/discord.mjs";
import type { HaloService } from "../../halo/halo.mjs";
import { aFakeDiscordServiceWith } from "../../discord/fakes/discord.fake.mjs";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";

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
});
