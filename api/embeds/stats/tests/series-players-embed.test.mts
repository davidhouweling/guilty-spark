import { describe, beforeEach, expect, it } from "vitest";
import { matchStats, playerXuidsToGametags } from "../../../services/halo/fakes/data.mjs";
import { SeriesPlayersEmbed } from "../series-players-embed.mjs";
import type { HaloService } from "../../../services/halo/halo.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import { aFakeHaloServiceWith } from "../../../services/halo/fakes/halo.fake.mjs";
import { aFakeDiscordServiceWith } from "../../../services/discord/fakes/discord.fake.mjs";
import type { DiscordService } from "../../../services/discord/discord.mjs";
import type { GuildConfigRow } from "../../../services/database/types/guild_config.mjs";
import { aFakeGuildConfigRow } from "../../../services/database/fakes/database.fake.mjs";

const ctfMatch = Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"));
const kothMatch = Preconditions.checkExists(matchStats.get("e20900f9-4c6c-4003-a175-00000000koth"));
const slayerMatch = Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"));
const matches = [ctfMatch, kothMatch, slayerMatch];

describe("SeriesPlayersEmbed", () => {
  const locale = "en-US";
  let discordService: DiscordService;
  let haloService: HaloService;
  let guildConfig: GuildConfigRow;
  let seriesPlayersEmbed: SeriesPlayersEmbed;

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
    guildConfig = aFakeGuildConfigRow();
    seriesPlayersEmbed = new SeriesPlayersEmbed({ discordService, haloService, guildConfig, locale });
  });

  describe("getEmbed", () => {
    it("returns promise reject", async () => {
      await expect(seriesPlayersEmbed.getEmbed(slayerMatch, playerXuidsToGametags)).rejects.toThrowError(
        "Series embed does not implement getEmbed, use getSeriesEmbed instead",
      );
    });
  });

  describe("getSeriesEmbed", () => {
    it("returns the expected embed", async () => {
      const result = await seriesPlayersEmbed.getSeriesEmbed(matches, playerXuidsToGametags, locale);
      expect(result).toMatchSnapshot();
    });

    it("excludes players not present at beginning", async () => {
      const modifiedCtfMatch = structuredClone(ctfMatch);
      const modifiedKothMatch = structuredClone(kothMatch);
      const modifiedSlayerMatch = structuredClone(slayerMatch);

      // Set first player in each match as not present at beginning
      Preconditions.checkExists(modifiedCtfMatch.Players[0]).ParticipationInfo.PresentAtBeginning = false;
      Preconditions.checkExists(modifiedKothMatch.Players[0]).ParticipationInfo.PresentAtBeginning = false;
      Preconditions.checkExists(modifiedSlayerMatch.Players[0]).ParticipationInfo.PresentAtBeginning = false;

      const modifiedMatches = [modifiedCtfMatch, modifiedKothMatch, modifiedSlayerMatch];
      const result = await seriesPlayersEmbed.getSeriesEmbed(modifiedMatches, playerXuidsToGametags, locale);

      // Player should not appear in results
      const allFieldNames = result.flatMap((embed) => embed.fields?.map((field) => field.name) ?? []);
      expect(allFieldNames.every((name) => !name.includes("gamertag0100000000000000"))).toBe(true);
    });
  });
});
