import { describe, it, expect, vi, beforeEach } from "vitest";
import { ButtonStyle, ComponentType } from "discord-api-types/v10";
import { LiveTrackerEmbed, type EnrichedMatchData } from "../live-tracker-embed.mjs";
import type { DiscordService } from "../../services/discord/discord.mjs";
import { aFakeDiscordServiceWith } from "../../services/discord/fakes/discord.fake.mjs";

describe("LiveTrackerEmbed", () => {
  let discordService: DiscordService;

  const testEnrichedMatches: EnrichedMatchData[] = [
    {
      matchId: "match-1",
      gameTypeAndMap: "Slayer on Aquarius",
      duration: "8m 45s",
      gameScore: "50:42",
      endTime: new Date("2024-01-01T10:15:00Z"),
    },
    {
      matchId: "match-2",
      gameTypeAndMap: "CTF on Catalyst",
      duration: "12m 30s",
      gameScore: "3:2",
      endTime: new Date("2024-01-01T10:30:00Z"),
    },
  ];

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    vi.spyOn(discordService, "getTimestamp").mockImplementation((timestamp, format) => {
      const epochSeconds = Math.floor(Date.parse(timestamp) / 1000);
      return `<t:${epochSeconds.toString()}:${format ?? "f"}>`;
    });
  });

  describe("initial state (no matches)", () => {
    it("creates embed with waiting message", () => {
      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService },
        {
          userId: "user123",
          guildId: "guild123",
          channelId: "channel123",
          queueNumber: 42,
          status: "active",
          isPaused: false,
          seriesScore: "Team Alpha 0 - 0 Team Beta",
          enrichedMatches: [],
          lastUpdated: new Date("2024-12-06T12:00:00Z"),
          nextCheck: new Date("2024-12-06T12:03:00Z"),
          errorState: undefined,
        },
      );

      const { embed } = liveTrackerEmbed;

      expect(embed.title).toContain("Live Tracker - Queue #42");
      expect(embed.description).toBe("**Live Tracking Active**");
      expect(embed.color).toBe(0x28a745); // Green for active
      expect(embed.fields).toBeDefined();

      const statusField = embed.fields?.find((field) => field.value.includes("⏳ *Waiting for first match"));
      expect(statusField).toBeDefined();
    });
  });

  describe("active state with matches", () => {
    it("creates embed with match data", () => {
      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService },
        {
          userId: "user123",
          guildId: "guild123",
          channelId: "channel123",
          queueNumber: 777,
          status: "active",
          isPaused: false,
          seriesScore: "Team Alpha 2 - 1 Team Beta (🦅:🐍)",
          enrichedMatches: testEnrichedMatches,
          lastUpdated: new Date("2024-12-06T12:00:00Z"),
          nextCheck: new Date("2024-12-06T12:03:00Z"),
          errorState: undefined,
        },
      );

      const { embed } = liveTrackerEmbed;

      expect(embed.title).toContain("Live Tracker - Queue #777");
      expect(embed.description).toBe("**Live Tracking Active**");
      expect(embed.color).toBe(0x28a745); // Green for active

      expect(embed.fields).toBeDefined();
      expect(embed.fields?.length).toBeGreaterThan(0);

      const gameField = embed.fields?.find((field) => field.name === "Game");
      expect(gameField).toBeDefined();
      expect(gameField?.value).toContain("Slayer on Aquarius");
    });
  });

  describe("paused state", () => {
    it("creates embed with paused styling", () => {
      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService },
        {
          userId: "user123",
          guildId: "guild123",
          channelId: "channel123",
          queueNumber: 42,
          status: "active",
          isPaused: true,
          seriesScore: "Team Alpha 1 - 1 Team Beta",
          enrichedMatches: testEnrichedMatches.slice(0, 1),
          lastUpdated: new Date("2024-12-06T12:00:00Z"),
          nextCheck: undefined,
          errorState: undefined,
        },
      );

      const { embed } = liveTrackerEmbed;

      expect(embed.title).toContain("Live Tracker - Queue #42");
      expect(embed.description).toBe("**Live Tracking Paused**");
      expect(embed.color).toBe(0xffa500); // Orange for paused
    });
  });

  describe("stopped state", () => {
    it("creates embed with stopped styling", () => {
      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService },
        {
          userId: "user123",
          guildId: "guild123",
          channelId: "channel123",
          queueNumber: 42,
          status: "stopped",
          isPaused: false,
          seriesScore: "Team Alpha 3 - 2 Team Beta (🦅:🐍)",
          enrichedMatches: testEnrichedMatches,
          lastUpdated: new Date("2024-12-06T12:00:00Z"),
          nextCheck: undefined,
          errorState: undefined,
        },
      );

      const { embed } = liveTrackerEmbed;

      expect(embed.title).toContain("Live Tracker - Queue #42");
      expect(embed.description).toBe("**Live Tracking Stopped**");
      expect(embed.color).toBe(0x808080); // Gray for stopped
    });
  });

  describe("error state", () => {
    it("creates embed with error message", () => {
      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService },
        {
          userId: "user123",
          guildId: "guild123",
          channelId: "channel123",
          queueNumber: 42,
          status: "active",
          isPaused: false,
          seriesScore: "Team Alpha 1 - 0 Team Beta",
          enrichedMatches: [],
          lastUpdated: new Date("2024-12-06T12:00:00Z"),
          nextCheck: new Date("2024-12-06T12:05:00Z"),
          errorState: {
            consecutiveErrors: 2,
            backoffMinutes: 5,
            lastSuccessTime: "2024-12-06T11:55:00Z",
            lastErrorMessage: "API temporarily unavailable",
          },
        },
      );

      const { embed } = liveTrackerEmbed;

      expect(embed.title).toContain("Live Tracker - Queue #42");
      expect(embed.description).toBeDefined();
      expect(embed.description).not.toBe("**Active**");
    });
  });

  describe("action components", () => {
    it("creates buttons for active state", () => {
      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService },
        {
          userId: "user123",
          guildId: "guild123",
          channelId: "channel123",
          queueNumber: 42,
          status: "active",
          isPaused: false,
          seriesScore: "Team Alpha 1 - 0 Team Beta",
          enrichedMatches: [],
          lastUpdated: new Date("2024-12-06T12:00:00Z"),
          nextCheck: new Date("2024-12-06T12:03:00Z"),
          errorState: undefined,
        },
      );

      const { actions } = liveTrackerEmbed;

      expect(actions).toBeDefined();
      expect(actions.length).toBeGreaterThan(0);
    });

    it("creates buttons for paused state", () => {
      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService },
        {
          userId: "user123",
          guildId: "guild123",
          channelId: "channel123",
          queueNumber: 42,
          status: "active",
          isPaused: true,
          seriesScore: "Team Alpha 1 - 0 Team Beta",
          enrichedMatches: [],
          lastUpdated: new Date("2024-12-06T12:00:00Z"),
          nextCheck: undefined,
          errorState: undefined,
        },
      );

      const { actions } = liveTrackerEmbed;

      expect(actions).toBeDefined();
      expect(actions.length).toBeGreaterThan(0);
    });

    it("creates no buttons for stopped state", () => {
      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService },
        {
          userId: "user123",
          guildId: "guild123",
          channelId: "channel123",
          queueNumber: 42,
          status: "stopped",
          isPaused: false,
          seriesScore: "Team Alpha 3 - 2 Team Beta",
          enrichedMatches: testEnrichedMatches,
          lastUpdated: new Date("2024-12-06T12:00:00Z"),
          nextCheck: undefined,
          errorState: undefined,
        },
      );

      const { actions } = liveTrackerEmbed;

      expect(actions).toHaveLength(0);
    });

    describe("repost button", () => {
      it("includes repost button for active state", () => {
        const liveTrackerEmbed = new LiveTrackerEmbed(
          { discordService },
          {
            userId: "user123",
            guildId: "guild123",
            channelId: "channel123",
            queueNumber: 42,
            status: "active",
            isPaused: false,
            seriesScore: "Team Alpha 1 - 0 Team Beta",
            enrichedMatches: [],
            lastUpdated: new Date("2024-12-06T12:00:00Z"),
            nextCheck: new Date("2024-12-06T12:03:00Z"),
            errorState: undefined,
          },
        );

        const { actions } = liveTrackerEmbed;

        expect(actions).toHaveLength(2);
        expect(actions[1]).toEqual(
          expect.objectContaining({
            type: ComponentType.ActionRow,
            components: [
              expect.objectContaining({
                type: ComponentType.Button,
                custom_id: "btn_track_repost",
                label: "Move to bottom of chat",
                style: ButtonStyle.Secondary,
                emoji: { name: "⏬" },
              }),
            ],
          }),
        );
      });

      it("includes repost button for paused state", () => {
        const liveTrackerEmbed = new LiveTrackerEmbed(
          { discordService },
          {
            userId: "user123",
            guildId: "guild123",
            channelId: "channel123",
            queueNumber: 42,
            status: "active",
            isPaused: true,
            seriesScore: "Team Alpha 1 - 0 Team Beta",
            enrichedMatches: [],
            lastUpdated: new Date("2024-12-06T12:00:00Z"),
            nextCheck: undefined,
            errorState: undefined,
          },
        );

        const { actions } = liveTrackerEmbed;

        expect(actions).toHaveLength(2);
        expect(actions[1]).toEqual(
          expect.objectContaining({
            type: ComponentType.ActionRow,
            components: [
              expect.objectContaining({
                type: ComponentType.Button,
                custom_id: "btn_track_repost",
                label: "Move to bottom of chat",
                style: ButtonStyle.Secondary,
                emoji: { name: "⏬" },
              }),
            ],
          }),
        );
      });

      it("does not include repost button for stopped state", () => {
        const liveTrackerEmbed = new LiveTrackerEmbed(
          { discordService },
          {
            userId: "user123",
            guildId: "guild123",
            channelId: "channel123",
            queueNumber: 42,
            status: "stopped",
            isPaused: false,
            seriesScore: "Team Alpha 3 - 2 Team Beta",
            enrichedMatches: testEnrichedMatches,
            lastUpdated: new Date("2024-12-06T12:00:00Z"),
            nextCheck: undefined,
            errorState: undefined,
          },
        );

        const { actions } = liveTrackerEmbed;

        expect(actions).toHaveLength(0);
      });
    });
  });

  describe("series score formatting", () => {
    it("handles series score with emojis", () => {
      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService },
        {
          userId: "user123",
          guildId: "guild123",
          channelId: "channel123",
          queueNumber: 42,
          status: "active",
          isPaused: false,
          seriesScore: "Team Alpha 2 - 1 Team Beta (🦅:🐍)",
          enrichedMatches: testEnrichedMatches,
          lastUpdated: new Date("2024-12-06T12:00:00Z"),
          nextCheck: new Date("2024-12-06T12:03:00Z"),
          errorState: undefined,
        },
      );

      const { embed } = liveTrackerEmbed;

      const scoreField = embed.fields?.find((field) => field.name.includes("Score"));
      expect(scoreField).toBeDefined();
      expect(scoreField?.name).toContain("🦅:🐍");
    });

    it("handles series score without emojis", () => {
      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService },
        {
          userId: "user123",
          guildId: "guild123",
          channelId: "channel123",
          queueNumber: 42,
          status: "active",
          isPaused: false,
          seriesScore: "Team Alpha 1 - 0 Team Beta",
          enrichedMatches: testEnrichedMatches.slice(0, 1),
          lastUpdated: new Date("2024-12-06T12:00:00Z"),
          nextCheck: new Date("2024-12-06T12:03:00Z"),
          errorState: undefined,
        },
      );

      const { embed } = liveTrackerEmbed;

      const scoreField = embed.fields?.find((field) => field.name.includes("Score"));
      expect(scoreField).toBeDefined();
      expect(scoreField?.name).not.toContain("🦅:🐍");
    });
  });

  describe("timestamp formatting", () => {
    it("handles missing timestamps gracefully", () => {
      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService },
        {
          userId: "user123",
          guildId: "guild123",
          channelId: "channel123",
          queueNumber: 42,
          status: "active",
          isPaused: false,
          seriesScore: "Team Alpha 0 - 0 Team Beta",
          enrichedMatches: [],
          lastUpdated: undefined,
          nextCheck: undefined,
          errorState: undefined,
        },
      );

      const { embed } = liveTrackerEmbed;

      expect(embed.description).toBeDefined();
      expect(embed.description).toBe("**Live Tracking Active**");
    });
  });

  describe("substitutions", () => {
    it("interleaves substitutions with matches chronologically", () => {
      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService },
        {
          userId: "user123",
          guildId: "guild123",
          channelId: "channel123",
          queueNumber: 42,
          status: "active",
          isPaused: false,
          seriesScore: "🦅 1:1 🐍",
          enrichedMatches: testEnrichedMatches,
          substitutions: [
            {
              playerOutId: "player-out-1",
              playerInId: "player-in-1",
              teamIndex: 0,
              teamName: "Team Alpha",
              timestamp: "2024-12-06T12:00:00Z",
            },
          ],
          lastUpdated: new Date("2024-12-06T12:00:00Z"),
          nextCheck: new Date("2024-12-06T12:03:00Z"),
          errorState: undefined,
        },
      );

      const { embed } = liveTrackerEmbed;

      const gameField = embed.fields?.find((field) => field.name === "Game");
      expect(gameField).toBeDefined();
      expect(gameField?.value).toContain("*<@player-in-1> subbed in for <@player-out-1> (Team Alpha)*");
      expect(gameField?.value).toContain("[Slayer on Aquarius]");
      expect(gameField?.value).toContain("[CTF on Catalyst]");
    });

    it("shows substitutions before first match when no matches yet", () => {
      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService },
        {
          userId: "user123",
          guildId: "guild123",
          channelId: "channel123",
          queueNumber: 42,
          status: "active",
          isPaused: false,
          seriesScore: "🦅 0:0 🐍",
          enrichedMatches: [],
          substitutions: [
            {
              playerOutId: "player-out-1",
              playerInId: "player-in-1",
              teamIndex: 0,
              teamName: "Team Alpha",
              timestamp: "2024-12-06T12:00:00Z",
            },
          ],
          lastUpdated: new Date("2024-12-06T12:00:00Z"),
          nextCheck: new Date("2024-12-06T12:03:00Z"),
          errorState: undefined,
        },
      );

      const { embed } = liveTrackerEmbed;

      const statusField = embed.fields?.find((field) => field.name === "Status");
      expect(statusField).toBeDefined();
      expect(statusField?.value).toContain("*<@player-in-1> subbed in for <@player-out-1> (Team Alpha)*");
      expect(statusField?.value).toContain("⏳ *Waiting for first match to complete...*");
    });
  });

  describe("refresh cooldown", () => {
    it("shows cooldown message when cooldownState is set", () => {
      const currentTime = new Date();

      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService },
        {
          userId: "user123",
          guildId: "guild123",
          channelId: "channel123",
          queueNumber: 42,
          status: "active",
          isPaused: false,
          seriesScore: "0:0",
          enrichedMatches: [],
          lastUpdated: currentTime,
          nextCheck: new Date(currentTime.getTime() + 180000),
          errorState: undefined,
          cooldownState: {
            remainingSeconds: 20,
            message: "Please wait 20 seconds before refreshing again",
          },
        },
      );

      const { embed } = liveTrackerEmbed;
      expect(embed.fields).toBeDefined();
      expect(embed.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "🔄 Refresh Cooldown",
            value: "Please wait 20 seconds before refreshing again",
          }),
        ]),
      );
    });

    it("does not show cooldown message when cooldownState is not set", () => {
      const currentTime = new Date();

      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService },
        {
          userId: "user123",
          guildId: "guild123",
          channelId: "channel123",
          queueNumber: 42,
          status: "active",
          isPaused: false,
          seriesScore: "0:0",
          enrichedMatches: [],
          lastUpdated: currentTime,
          nextCheck: new Date(currentTime.getTime() + 180000),
          errorState: undefined,
          cooldownState: undefined,
        },
      );

      const { embed } = liveTrackerEmbed;
      expect(embed.fields).toBeDefined();
      const cooldownField = embed.fields?.find((field) => field.name === "🔄 Refresh Cooldown");
      expect(cooldownField).toBeUndefined();
    });

    it("does not show cooldown message when no cooldownState exists", () => {
      const currentTime = new Date();

      const liveTrackerEmbed = new LiveTrackerEmbed(
        { discordService },
        {
          userId: "user123",
          guildId: "guild123",
          channelId: "channel123",
          queueNumber: 42,
          status: "active",
          isPaused: false,
          seriesScore: "0:0",
          enrichedMatches: [],
          lastUpdated: currentTime,
          nextCheck: new Date(currentTime.getTime() + 180000),
          errorState: undefined,
        },
      );

      const { embed } = liveTrackerEmbed;
      expect(embed.fields).toBeDefined();
      const cooldownField = embed.fields?.find((field) => field.name === "🔄 Refresh Cooldown");
      expect(cooldownField).toBeUndefined();
    });
  });
});
