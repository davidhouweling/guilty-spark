import { describe, beforeEach, expect, it } from "vitest";
import { matchStats, playerXuidsToGametags } from "../../services/halo/fakes/data.mjs";
import { VIPMatchEmbed } from "../vip-match-embed.mjs";
import type { HaloService } from "../../services/halo/halo.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { aFakeHaloServiceWith } from "../../services/halo/fakes/halo.fake.mjs";
import type { DiscordService } from "../../services/discord/discord.mjs";
import { aFakeDiscordServiceWith } from "../../services/discord/fakes/discord.fake.mjs";

const match = Preconditions.checkExists(matchStats.get("28af2f64-7c05-458d-b8b1-000000000vip"));

describe("VIPMatchEmbed", () => {
  const locale = "en-US";
  let discordService: DiscordService;
  let haloService: HaloService;
  let matchEmbed: VIPMatchEmbed;

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
    matchEmbed = new VIPMatchEmbed({ discordService, haloService, locale });
  });

  describe("getEmbed", () => {
    it("returns the expected embed", async () => {
      const result = await matchEmbed.getEmbed(match, playerXuidsToGametags);
      expect(result).toMatchSnapshot();
    });
  });
});
