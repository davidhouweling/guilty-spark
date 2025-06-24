import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MatchStats } from "halo-infinite-api";
import { SeriesOverviewEmbed } from "../series-overview-embed.mjs";
import type { SeriesOverviewEmbedFinalTeams, SeriesOverviewEmbedSubstitution } from "../series-overview-embed.mjs";
import type { DiscordService } from "../../services/discord/discord.mjs";
import type { HaloService } from "../../services/halo/halo.mjs";
import { aFakeDiscordServiceWith } from "../../services/discord/fakes/discord.fake.mjs";
import { aFakeHaloServiceWith } from "../../services/halo/fakes/halo.fake.mjs";
import { matchStats } from "../../services/halo/fakes/data.mjs";

describe("SeriesOverviewEmbed", () => {
  let discordService: DiscordService;
  let haloService: HaloService;
  let seriesOverviewEmbed: SeriesOverviewEmbed;
  let sampleMatchStats: MatchStats;

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
    seriesOverviewEmbed = new SeriesOverviewEmbed({ discordService, haloService });

    // Get a sample match from the fake data
    const matchStatsArray = Array.from(matchStats.values());
    const [firstMatch] = matchStatsArray;
    if (!firstMatch) {
      throw new Error("No match stats available for testing");
    }
    sampleMatchStats = firstMatch;

    vi.spyOn(haloService, "getGameTypeAndMap").mockResolvedValue("CTF on Bazaar");
    vi.spyOn(haloService, "getReadableDuration").mockReturnValue("10m 30s");
    vi.spyOn(haloService, "getMatchScore").mockReturnValue("3-1");
    vi.spyOn(discordService, "getTimestamp").mockReturnValue("<t:1700000000:f>");
  });

  describe("getEmbed", () => {
    it("creates an embed with final teams data", async () => {
      const finalTeams: SeriesOverviewEmbedFinalTeams[] = [
        {
          name: "Team Alpha",
          playerIds: ["user1", "user2"],
        },
        {
          name: "Team Beta",
          playerIds: ["user3", "user4"],
        },
      ];

      const embed = await seriesOverviewEmbed.getEmbed({
        guildId: "guild123",
        channel: "channel123",
        messageId: "message123",
        locale: "en-US",
        queue: 1,
        series: [sampleMatchStats],
        finalTeams,
        substitutions: [],
        hideTeamsDescription: false,
      });

      expect(embed).toBeDefined();
      expect(embed.title).toContain("Series stats for queue #1");
      expect(embed.fields).toBeDefined();
      expect(embed.description).toContain("Team Alpha");
      expect(embed.description).toContain("Team Beta");
    });

    it("creates an embed with substitutions", async () => {
      const finalTeams: SeriesOverviewEmbedFinalTeams[] = [
        {
          name: "Team Alpha",
          playerIds: ["user1", "user5"], // user5 substituted for user2
        },
        {
          name: "Team Beta",
          playerIds: ["user3", "user4"],
        },
      ];

      const substitutions: SeriesOverviewEmbedSubstitution[] = [
        {
          playerIn: "user5",
          playerOut: "user2",
          date: new Date("2024-01-01T10:05:00Z"), // Before match start
          team: "Team Alpha",
        },
      ];

      const embed = await seriesOverviewEmbed.getEmbed({
        guildId: "guild123",
        channel: "channel123",
        messageId: "message123",
        locale: "en-US",
        queue: 1,
        series: [sampleMatchStats],
        finalTeams,
        substitutions,
        hideTeamsDescription: false,
      });

      expect(embed).toBeDefined();
      expect(embed.title).toContain("Series stats for queue #1");
      // The substitution should appear in the embed since it happened before the match
    });

    it("handles hidden teams description", async () => {
      const finalTeams: SeriesOverviewEmbedFinalTeams[] = [
        {
          name: "Team Alpha",
          playerIds: ["user1", "user2"],
        },
        {
          name: "Team Beta",
          playerIds: ["user3", "user4"],
        },
      ];

      const embed = await seriesOverviewEmbed.getEmbed({
        guildId: "guild123",
        channel: "channel123",
        messageId: "message123",
        locale: "en-US",
        queue: 1,
        series: [sampleMatchStats],
        finalTeams,
        substitutions: [],
        hideTeamsDescription: true,
      });

      expect(embed).toBeDefined();
      expect(embed.description).not.toContain("Team Alpha");
      expect(embed.description).not.toContain("Team Beta");
      expect(embed.description).toContain("Start time:");
    });

    it("handles empty substitutions array", async () => {
      const finalTeams: SeriesOverviewEmbedFinalTeams[] = [
        {
          name: "Team Alpha",
          playerIds: ["user1", "user2"],
        },
        {
          name: "Team Beta",
          playerIds: ["user3", "user4"],
        },
      ];

      const embed = await seriesOverviewEmbed.getEmbed({
        guildId: "guild123",
        channel: "channel123",
        messageId: "message123",
        locale: "en-US",
        queue: 1,
        series: [sampleMatchStats],
        finalTeams,
        substitutions: [],
        hideTeamsDescription: false,
      });

      expect(embed).toBeDefined();
      expect(embed.fields).toBeDefined();
      expect(embed.fields?.length).toBeGreaterThan(0);
    });

    it("includes correct game information in fields", async () => {
      const finalTeams: SeriesOverviewEmbedFinalTeams[] = [
        {
          name: "Team Alpha",
          playerIds: ["user1", "user2"],
        },
        {
          name: "Team Beta",
          playerIds: ["user3", "user4"],
        },
      ];

      const getGameTypeAndMapSpy = vi.spyOn(haloService, "getGameTypeAndMap");
      const getReadableDurationSpy = vi.spyOn(haloService, "getReadableDuration");
      const getMatchScoreSpy = vi.spyOn(haloService, "getMatchScore");

      const embed = await seriesOverviewEmbed.getEmbed({
        guildId: "guild123",
        channel: "channel123",
        messageId: "message123",
        locale: "en-US",
        queue: 1,
        series: [sampleMatchStats],
        finalTeams,
        substitutions: [],
        hideTeamsDescription: false,
      });

      expect(getGameTypeAndMapSpy).toHaveBeenCalledWith(sampleMatchStats.MatchInfo);
      expect(getReadableDurationSpy).toHaveBeenCalledWith(sampleMatchStats.MatchInfo.Duration, "en-US");
      expect(getMatchScoreSpy).toHaveBeenCalledWith(sampleMatchStats, "en-US");

      expect(embed.fields).toBeDefined();
      expect(embed.fields?.some((field) => field.name === "Game")).toBe(true);
      expect(embed.fields?.some((field) => field.name === "Duration")).toBe(true);
      expect(embed.fields?.some((field) => field.name === "Score (🦅:🐍)")).toBe(true);
    });
  });
});
