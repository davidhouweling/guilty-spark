import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MatchStats } from "halo-infinite-api";
import { SeriesOverviewEmbed } from "../series-overview-embed.mjs";
import type { SeriesOverviewEmbedFinalTeams, SeriesOverviewEmbedSubstitution } from "../series-overview-embed.mjs";
import type { DiscordService } from "../../../services/discord/discord.mjs";
import type { HaloService } from "../../../services/halo/halo.mjs";
import { aFakeDiscordServiceWith } from "../../../services/discord/fakes/discord.fake.mjs";
import { aFakeHaloServiceWith } from "../../../services/halo/fakes/halo.fake.mjs";
import { matchStats } from "../../../services/halo/fakes/data.mjs";

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
    if (firstMatch == null) {
      throw new Error("No match stats available for testing");
    }
    sampleMatchStats = firstMatch;

    vi.spyOn(haloService, "getGameTypeAndMap").mockResolvedValue("CTF on Bazaar");
    vi.spyOn(haloService, "getReadableDuration").mockReturnValue("10m 30s");
    vi.spyOn(haloService, "getMatchScore").mockReturnValue({ gameScore: "3-1", gameSubScore: null });
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

      const embeds = await seriesOverviewEmbed.getEmbed({
        guildId: "guild123",
        channelId: "channel123",
        messageId: "message123",
        locale: "en-US",
        queue: 1,
        series: [sampleMatchStats],
        finalTeams,
        substitutions: [],
        hideTeamsDescription: false,
      });

      expect(embeds).toBeDefined();
      expect(embeds.length).toBeGreaterThan(0);
      const [firstEmbed] = embeds;
      expect(firstEmbed?.title).toContain("Series stats for queue #1");
      expect(firstEmbed?.fields).toBeDefined();
      expect(firstEmbed?.description).toContain("Team Alpha");
      expect(firstEmbed?.description).toContain("Team Beta");
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

      const embeds = await seriesOverviewEmbed.getEmbed({
        guildId: "guild123",
        channelId: "channel123",
        messageId: "message123",
        locale: "en-US",
        queue: 1,
        series: [sampleMatchStats],
        finalTeams,
        substitutions,
        hideTeamsDescription: false,
      });

      expect(embeds).toBeDefined();
      expect(embeds.length).toBeGreaterThan(0);
      const [firstEmbed] = embeds;
      expect(firstEmbed?.title).toContain("Series stats for queue #1");
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

      const embeds = await seriesOverviewEmbed.getEmbed({
        guildId: "guild123",
        channelId: "channel123",
        messageId: "message123",
        locale: "en-US",
        queue: 1,
        series: [sampleMatchStats],
        finalTeams,
        substitutions: [],
        hideTeamsDescription: true,
      });

      expect(embeds).toBeDefined();
      expect(embeds.length).toBeGreaterThan(0);
      const [firstEmbed] = embeds;
      expect(firstEmbed?.description).not.toContain("Team Alpha");
      expect(firstEmbed?.description).not.toContain("Team Beta");
      expect(firstEmbed?.description).toContain("Start time:");
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

      const embeds = await seriesOverviewEmbed.getEmbed({
        guildId: "guild123",
        channelId: "channel123",
        messageId: "message123",
        locale: "en-US",
        queue: 1,
        series: [sampleMatchStats],
        finalTeams,
        substitutions: [],
        hideTeamsDescription: false,
      });

      expect(embeds).toBeDefined();
      expect(embeds.length).toBeGreaterThan(0);
      const [firstEmbed] = embeds;
      expect(firstEmbed?.fields).toBeDefined();
      expect(firstEmbed?.fields?.length).toBeGreaterThan(0);
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

      const embeds = await seriesOverviewEmbed.getEmbed({
        guildId: "guild123",
        channelId: "channel123",
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

      expect(embeds.length).toBeGreaterThan(0);
      const [firstEmbed] = embeds;
      expect(firstEmbed?.fields).toBeDefined();
      expect(firstEmbed?.fields?.some((field) => field.name === "Game")).toBe(true);
      expect(firstEmbed?.fields?.some((field) => field.name === "Duration")).toBe(true);
      expect(firstEmbed?.fields?.some((field) => field.name === "Score (🦅:🐍)")).toBe(true);
    });

    it("splits into multiple embeds when data exceeds field character limits", async () => {
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

      // Create a very long game type/map string that will force splitting
      const longGameType = "A".repeat(100);
      vi.spyOn(haloService, "getGameTypeAndMap").mockResolvedValue(longGameType);
      vi.spyOn(haloService, "getReadableDuration").mockReturnValue("10m 30s");
      vi.spyOn(haloService, "getMatchScore").mockReturnValue({ gameScore: "3-1", gameSubScore: null });

      // Create enough matches to exceed the 1024 character limit for a single field
      // With 100 characters per game + markdown link, we need about 12 matches to exceed the limit
      const manyMatches = Array.from({ length: 15 }).fill(sampleMatchStats) as MatchStats[];

      const embeds = await seriesOverviewEmbed.getEmbed({
        guildId: "guild123",
        channelId: "channel123",
        messageId: "message123",
        locale: "en-US",
        queue: 1,
        series: manyMatches,
        finalTeams,
        substitutions: [],
        hideTeamsDescription: false,
      });

      // Should have multiple embeds due to character limit
      expect(embeds.length).toBeGreaterThan(1);

      // First embed should have title, description, and URL
      const [firstEmbed] = embeds;
      expect(firstEmbed?.title).toBeDefined();
      expect(firstEmbed?.description).toBeDefined();
      expect(firstEmbed?.url).toBeDefined();
      expect(firstEmbed?.color).toBeDefined();

      // Subsequent embeds should only have color, not title/description/URL
      const [, secondEmbed] = embeds;
      expect(secondEmbed?.title).toBeUndefined();
      expect(secondEmbed?.description).toBeUndefined();
      expect(secondEmbed?.url).toBeUndefined();
      expect(secondEmbed?.color).toBeDefined();

      // All embeds should have fields
      for (const embed of embeds) {
        expect(embed.fields).toBeDefined();
        expect(embed.fields?.length).toBe(3); // Game, Duration, Score
      }

      // Verify no field value exceeds 1024 characters
      for (const embed of embeds) {
        for (const field of embed.fields ?? []) {
          expect(field.value.length).toBeLessThanOrEqual(1024);
        }
      }
    });
  });
});
