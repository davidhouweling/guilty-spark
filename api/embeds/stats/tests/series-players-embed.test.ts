import { describe, beforeEach, expect, it } from "vitest";
import { MatchOutcome } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aMatchWithSwappableRosters, getMatchStats, getPlayerXuidsToGametags } from "../../../services/halo/fakes/data";
import { SeriesPlayersEmbed } from "../series-players-embed";
import type { HaloService } from "../../../services/halo/halo";
import { aFakeHaloServiceWith } from "../../../services/halo/fakes/halo.fake";
import { aFakeDiscordServiceWith } from "../../../services/discord/fakes/discord.fake";
import type { DiscordService } from "../../../services/discord/discord";
import type { GuildConfigRow } from "../../../services/database/types/guild_config";
import { aFakeGuildConfigRow } from "../../../services/database/fakes/database.fake";

const ctfMatch = Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf"));
const kothMatch = Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth"));
const slayerMatch = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
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
      await expect(seriesPlayersEmbed.getEmbed(slayerMatch, getPlayerXuidsToGametags())).rejects.toThrow(
        new Error("Series embed does not implement getEmbed, use getSeriesEmbed instead"),
      );
    });
  });

  describe("getSeriesEmbed", () => {
    it("returns the expected embed", async () => {
      const result = await seriesPlayersEmbed.getSeriesEmbed(matches, getPlayerXuidsToGametags(), locale);
      expect(result).toMatchSnapshot();
    });

    it("renders a consolidated objective summary line for mixed objective/slayer series", async () => {
      const result = await seriesPlayersEmbed.getSeriesEmbed(matches, getPlayerXuidsToGametags(), locale);
      const allFieldValues = result.flatMap((embed) => embed.fields?.map((field) => field.value) ?? []);

      expect(allFieldValues.some((value) => value.includes("Team objective contribution (time):"))).toBe(true);
    });

    it("renders n/a team contribution when objective-team denominator is unavailable", async () => {
      const modifiedCtfMatch = structuredClone(ctfMatch);
      const modifiedKothMatch = structuredClone(kothMatch);
      const modifiedSlayerMatch = structuredClone(slayerMatch);

      for (const team of modifiedCtfMatch.Teams) {
        if ("CaptureTheFlagStats" in team.Stats) {
          team.Stats.CaptureTheFlagStats.TimeAsFlagCarrier = "PT0S";
        }
      }

      for (const team of modifiedKothMatch.Teams) {
        if ("ZonesStats" in team.Stats) {
          team.Stats.ZonesStats.StrongholdOccupationTime = "PT0S";
        }
      }

      const result = await seriesPlayersEmbed.getSeriesEmbed(
        [modifiedCtfMatch, modifiedKothMatch, modifiedSlayerMatch],
        getPlayerXuidsToGametags(),
        locale,
      );

      const allFieldValues = result.flatMap((embed) => embed.fields?.map((field) => field.value) ?? []);
      expect(
        allFieldValues.some((value) => value.includes("Objective time (team %):") && value.includes("(n/a)")),
      ).toBe(true);
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
      const result = await seriesPlayersEmbed.getSeriesEmbed(modifiedMatches, getPlayerXuidsToGametags(), locale);

      // Player should not appear in results
      const allFieldNames = result.flatMap((embed) => embed.fields?.map((field) => field.name) ?? []);
      expect(allFieldNames.every((name) => !name.includes("gamertag0100000000000000"))).toBe(true);
    });

    it("groups a player's accumulated stats under a single team heading even after a side swap", async () => {
      const rosterAAsTeam0 = aMatchWithSwappableRosters({
        matchId: "series-swap-game-1",
        startTime: "2024-11-26T10:00:00.000Z",
        mapAssetId: "map-a",
        team0PlayerIds: ["xuid(1)"],
        team1PlayerIds: ["xuid(2)"],
        team0Outcome: MatchOutcome.Win,
        team1Outcome: MatchOutcome.Loss,
      });
      // Same two rosters, but xuid(1) is now on TeamId 1
      const rosterAAsTeam1 = aMatchWithSwappableRosters({
        matchId: "series-swap-game-2",
        startTime: "2024-11-26T11:00:00.000Z",
        mapAssetId: "map-b",
        team0PlayerIds: ["xuid(2)"],
        team1PlayerIds: ["xuid(1)"],
        team0Outcome: MatchOutcome.Loss,
        team1Outcome: MatchOutcome.Win,
      });
      const players = new Map([
        ["1", "PlayerOne"],
        ["2", "PlayerTwo"],
      ]);

      const result = await seriesPlayersEmbed.getSeriesEmbed([rosterAAsTeam0, rosterAAsTeam1], players, locale);

      // Each player appears in exactly one team's embed (grouped by their first match's side)
      const playerOneEmbeds = result.filter(
        (embed) => embed.fields?.some((field) => field.name.startsWith("PlayerOne")) ?? false,
      );
      expect(playerOneEmbeds).toHaveLength(1);
    });
  });
});
