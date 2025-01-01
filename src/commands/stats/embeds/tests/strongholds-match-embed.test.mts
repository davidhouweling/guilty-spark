import { describe, beforeEach, expect, it } from "vitest";
import { matchStats, playerXuidsToGametags } from "../../../../services/halo/fakes/data.mjs";
import { StrongholdsMatchEmbed } from "../strongholds-match-embed.mjs";
import type { HaloService } from "../../../../services/halo/halo.mjs";
import { Preconditions } from "../../../../base/preconditions.mjs";
import { aFakeHaloServiceWith } from "../../../../services/halo/fakes/halo.fake.mjs";
import type { DiscordService } from "../../../../services/discord/discord.mjs";
import { aFakeDiscordServiceWith } from "../../../../services/discord/fakes/discord.fake.mjs";

const match = Preconditions.checkExists(matchStats.get("099deb74-3f60-48cf-8784-0strongholds"));

describe("StrongholdsMatchEmbed", () => {
  const locale = "en-US";
  let discordService: DiscordService;
  let haloService: HaloService;
  let matchEmbed: StrongholdsMatchEmbed;

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
    matchEmbed = new StrongholdsMatchEmbed({ discordService, haloService, locale });
  });

  describe("getEmbed", () => {
    it("returns the expected embed", async () => {
      const result = await matchEmbed.getEmbed(match, playerXuidsToGametags);
      expect(result).toMatchSnapshot();
    });
  });
});
