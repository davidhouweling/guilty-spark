import { describe, beforeEach, expect, it } from "vitest";
import { getMatchStats, getPlayerXuidsToGametags } from "../../../services/halo/fakes/data.mjs";
import { LandGrabMatchEmbed } from "../land-grab-match-embed.mjs";
import type { HaloService } from "../../../services/halo/halo.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import { aFakeHaloServiceWith } from "../../../services/halo/fakes/halo.fake.mjs";
import type { DiscordService } from "../../../services/discord/discord.mjs";
import { aFakeDiscordServiceWith } from "../../../services/discord/fakes/discord.fake.mjs";
import { aFakeGuildConfigRow } from "../../../services/database/fakes/database.fake.mjs";
import type { GuildConfigRow } from "../../../services/database/types/guild_config.mjs";

const match = Preconditions.checkExists(getMatchStats("32b4cddf-5451-4d83-bcf6-000land-grab"));

describe("LandGrabMatchEmbed", () => {
  const locale = "en-US";
  let discordService: DiscordService;
  let haloService: HaloService;
  let guildConfig: GuildConfigRow;
  let matchEmbed: LandGrabMatchEmbed;

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
    guildConfig = aFakeGuildConfigRow();
    matchEmbed = new LandGrabMatchEmbed({ discordService, haloService, guildConfig, locale });
  });

  describe("getEmbed", () => {
    it("returns the expected embed", async () => {
      const result = await matchEmbed.getEmbed(match, getPlayerXuidsToGametags());
      expect(result).toMatchSnapshot();
    });
  });
});
