import { describe, beforeEach, expect, it } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getMatchStats, getPlayerXuidsToGametags } from "../../../services/halo/fakes/data";
import { GrifballMatchEmbed } from "../grifball-match-embed";
import type { HaloService } from "../../../services/halo/halo";
import { aFakeHaloServiceWith } from "../../../services/halo/fakes/halo.fake";
import { aFakeDiscordServiceWith } from "../../../services/discord/fakes/discord.fake";
import type { DiscordService } from "../../../services/discord/discord";
import type { GuildConfigRow } from "../../../services/database/types/guild_config";
import { aFakeGuildConfigRow } from "../../../services/database/fakes/database.fake";

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
