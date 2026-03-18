import { describe, beforeEach, expect, it } from "vitest";
import { getMatchStats, getPlayerXuidsToGametags } from "../../../services/halo/fakes/data.mjs";
import { GrifballMatchEmbed } from "../grifball-match-embed.mjs";
import type { HaloService } from "../../../services/halo/halo.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import { aFakeHaloServiceWith } from "../../../services/halo/fakes/halo.fake.mjs";
import { aFakeDiscordServiceWith } from "../../../services/discord/fakes/discord.fake.mjs";
import type { DiscordService } from "../../../services/discord/discord.mjs";
import type { GuildConfigRow } from "../../../services/database/types/guild_config.mjs";
import { aFakeGuildConfigRow } from "../../../services/database/fakes/database.fake.mjs";

const match = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));

describe("GrifballMatchEmbed", () => {
  const locale = "en-US";
  let discordService: DiscordService;
  let haloService: HaloService;
  let guildConfig: GuildConfigRow;
  let matchEmbed: GrifballMatchEmbed;

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
    guildConfig = aFakeGuildConfigRow();
    matchEmbed = new GrifballMatchEmbed({ discordService, haloService, guildConfig, locale });
  });

  describe("getEmbed", () => {
    it("returns the expected embed", async () => {
      const result = await matchEmbed.getEmbed(match, getPlayerXuidsToGametags());
      expect(result).toMatchSnapshot();
    });
  });
});
