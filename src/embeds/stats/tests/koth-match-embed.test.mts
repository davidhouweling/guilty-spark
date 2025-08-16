import { describe, beforeEach, expect, it } from "vitest";
import { matchStats, playerXuidsToGametags } from "../../../services/halo/fakes/data.mjs";
import { KOTHMatchEmbed } from "../koth-match-embed.mjs";
import type { HaloService } from "../../../services/halo/halo.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import { aFakeHaloServiceWith } from "../../../services/halo/fakes/halo.fake.mjs";
import type { DiscordService } from "../../../services/discord/discord.mjs";
import { aFakeDiscordServiceWith } from "../../../services/discord/fakes/discord.fake.mjs";
import type { GuildConfigRow } from "../../../services/database/types/guild_config.mjs";
import { aFakeGuildConfigRow } from "../../../services/database/fakes/database.fake.mjs";

const match = Preconditions.checkExists(matchStats.get("e20900f9-4c6c-4003-a175-00000000koth"));

describe("KOTHMatchEmbed", () => {
  const locale = "en-US";
  let discordService: DiscordService;
  let haloService: HaloService;
  let guildConfig: GuildConfigRow;
  let matchEmbed: KOTHMatchEmbed;

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
    guildConfig = aFakeGuildConfigRow();
    matchEmbed = new KOTHMatchEmbed({ discordService, haloService, guildConfig, locale });
  });

  describe("getEmbed", () => {
    it("returns the expected embed", async () => {
      const result = await matchEmbed.getEmbed(match, playerXuidsToGametags);
      expect(result).toMatchSnapshot();
    });
  });
});
