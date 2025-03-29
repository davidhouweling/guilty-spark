import { describe, beforeEach, expect, it } from "vitest";
import { matchStats, playerXuidsToGametags } from "../../services/halo/fakes/data.mjs";
import { LandGrabMatchEmbed } from "../land-grab-match-embed.mjs";
import type { HaloService } from "../../services/halo/halo.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { aFakeHaloServiceWith } from "../../services/halo/fakes/halo.fake.mjs";
import type { DiscordService } from "../../services/discord/discord.mjs";
import { aFakeDiscordServiceWith } from "../../services/discord/fakes/discord.fake.mjs";

const match = Preconditions.checkExists(matchStats.get("32b4cddf-5451-4d83-bcf6-000land-grab"));

describe("LandGrabMatchEmbed", () => {
  const locale = "en-US";
  let discordService: DiscordService;
  let haloService: HaloService;
  let matchEmbed: LandGrabMatchEmbed;

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
    matchEmbed = new LandGrabMatchEmbed({ discordService, haloService, locale });
  });

  describe("getEmbed", () => {
    it("returns the expected embed", async () => {
      const result = await matchEmbed.getEmbed(match, playerXuidsToGametags);
      expect(result).toMatchSnapshot();
    });
  });
});
