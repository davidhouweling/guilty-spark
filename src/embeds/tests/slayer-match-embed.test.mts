import { describe, beforeEach, expect, it } from "vitest";
import { matchStats, playerXuidsToGametags } from "../../services/halo/fakes/data.mjs";
import { SlayerMatchEmbed } from "../slayer-match-embed.mjs";
import type { HaloService } from "../../services/halo/halo.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { aFakeHaloServiceWith } from "../../services/halo/fakes/halo.fake.mjs";
import { aFakeDiscordServiceWith } from "../../services/discord/fakes/discord.fake.mjs";
import type { DiscordService } from "../../services/discord/discord.mjs";
import type { GuildConfigRow } from "../../services/database/types/guild_config.mjs";
import { aFakeGuildConfigRow } from "../../services/database/fakes/database.fake.mjs";

const match = Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"));

describe("SlayerMatchEmbed", () => {
  const locale = "en-US";
  let discordService: DiscordService;
  let haloService: HaloService;
  let guildConfig: GuildConfigRow;
  let matchEmbed: SlayerMatchEmbed;

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
    guildConfig = aFakeGuildConfigRow();
    matchEmbed = new SlayerMatchEmbed({ discordService, haloService, guildConfig, locale });
  });

  describe("getEmbed", () => {
    it("returns the expected embed", async () => {
      const result = await matchEmbed.getEmbed(match, playerXuidsToGametags);
      expect(result).toMatchSnapshot();
    });
  });
});
