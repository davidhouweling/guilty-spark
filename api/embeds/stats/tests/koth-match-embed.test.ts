import { describe, beforeEach, expect, it } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getMatchStats, getPlayerXuidsToGametags } from "../../../services/halo/fakes/data";
import { KOTHMatchEmbed } from "../koth-match-embed";
import type { HaloService } from "../../../services/halo/halo";
import { aFakeHaloServiceWith } from "../../../services/halo/fakes/halo.fake";
import type { DiscordService } from "../../../services/discord/discord";
import { aFakeDiscordServiceWith } from "../../../services/discord/fakes/discord.fake";
import type { GuildConfigRow } from "../../../services/database/types/guild_config";
import { aFakeGuildConfigRow } from "../../../services/database/fakes/database.fake";

const match = Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth"));

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
      const result = await matchEmbed.getEmbed(match, getPlayerXuidsToGametags());
      expect(result).toMatchSnapshot();
    });
  });
});
