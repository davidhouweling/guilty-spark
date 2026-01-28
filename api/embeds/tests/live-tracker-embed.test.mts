import type { MockInstance } from "vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ButtonStyle, ComponentType } from "discord-api-types/v10";
import type { LiveTrackerMatchSummary } from "@guilty-spark/contracts/live-tracker/types";
import { LiveTrackerEmbed } from "../live-tracker-embed.mjs";
import type { LiveTrackerEmbedData } from "../../live-tracker/types.mjs";
import type { DiscordService } from "../../services/discord/discord.mjs";
import { aFakeDiscordServiceWith } from "../../services/discord/fakes/discord.fake.mjs";
import { Preconditions } from "../../base/preconditions.mjs";

describe("LiveTrackerEmbed", () => {
  let discordService: DiscordService;
  let getTimestampSpy: MockInstance<DiscordService["getTimestamp"]>;

  const testEnrichedMatches: LiveTrackerMatchSummary[] = [
    {
      matchId: "match-1",
      gameTypeAndMap: "Slayer on Aquarius",
      gameType: "Slayer",
      gameMap: "Aquarius",
      gameMapThumbnailUrl: "https://example.com/aquarius-thumb.png",
      duration: "8m 45s",
      gameScore: "50:42",
      gameSubScore: null,
      endTime: "2024-01-01T10:15:00Z",
    },
    {
      matchId: "match-2",
      gameTypeAndMap: "CTF on Catalyst",
      gameType: "CTF",
      gameMap: "Catalyst",
      gameMapThumbnailUrl: "https://example.com/catalyst-thumb.png",
      duration: "12m 30s",
      gameScore: "3:2",
      gameSubScore: null,
      endTime: "2024-01-01T10:30:00Z",
    },
  ];

  const baseEmbedData: LiveTrackerEmbedData = {
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
  };

  const createLiveTrackerEmbed = (overrides: Partial<LiveTrackerEmbedData> = {}): LiveTrackerEmbed => {
    return new LiveTrackerEmbed({ discordService }, { ...baseEmbedData, ...overrides });
  };

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    getTimestampSpy = vi.spyOn(discordService, "getTimestamp").mockImplementation((timestamp, format) => {
      const epochSeconds = Math.floor(Date.parse(timestamp) / 1000);
      return `<t:${epochSeconds.toString()}:${format ?? "f"}>`;
    });
  });

  describe("initial state (no matches)", () => {
    it("creates embed with waiting message", () => {
      const liveTrackerEmbed = createLiveTrackerEmbed({
        queueNumber: 42,
        status: "active",
        isPaused: false,
        seriesScore: "Team Alpha 0 - 0 Team Beta",
        enrichedMatches: [],
      });

      const { embed } = liveTrackerEmbed;

      expect(embed.title).toContain("Live Tracker - Queue #42");
      expect(embed.description).toBe("**Live Tracking Active**");
      expect(embed.color).toBe(0x28a745); // Green for active
      expect(embed.fields).toBeDefined();

      const statusField = embed.fields?.find((field) => field.value.includes("⏳ *Waiting for first match"));
      expect(statusField).toBeDefined();

      expect(getTimestampSpy).toHaveBeenCalled();
    });
  });

  describe("active state with matches", () => {
    it("creates embed with match data", () => {
      const liveTrackerEmbed = createLiveTrackerEmbed({
        queueNumber: 777,
        status: "active",
        isPaused: false,
        seriesScore: "Team Alpha 2 - 1 Team Beta (🦅:🐍)",
        enrichedMatches: testEnrichedMatches,
      });

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
      const liveTrackerEmbed = createLiveTrackerEmbed({
        status: "active",
        isPaused: true,
        seriesScore: "Team Alpha 1 - 1 Team Beta",
        enrichedMatches: testEnrichedMatches.slice(0, 1),
        nextCheck: undefined,
      });

      const { embed } = liveTrackerEmbed;

      expect(embed.title).toContain("Live Tracker - Queue #42");
      expect(embed.description).toBe("**Live Tracking Paused**");
      expect(embed.color).toBe(0xffa500); // Orange for paused
    });
  });

  describe("stopped state", () => {
    it("creates embed with stopped styling", () => {
      const liveTrackerEmbed = createLiveTrackerEmbed({
        status: "stopped",
        seriesScore: "Team Alpha 3 - 2 Team Beta (🦅:🐍)",
        enrichedMatches: testEnrichedMatches,
        nextCheck: undefined,
      });

      const { embed } = liveTrackerEmbed;

      expect(embed.title).toContain("Live Tracker - Queue #42");
      expect(embed.description).toBe("**Live Tracking Stopped**");
      expect(embed.color).toBe(0x808080); // Gray for stopped
    });
  });

  describe("error state", () => {
    it("creates embed with error message", () => {
      const liveTrackerEmbed = createLiveTrackerEmbed({
        seriesScore: "Team Alpha 1 - 0 Team Beta",
        enrichedMatches: [],
        nextCheck: new Date("2024-12-06T12:05:00Z"),
        errorState: {
          consecutiveErrors: 2,
          backoffMinutes: 5,
          lastSuccessTime: "2024-12-06T11:55:00Z",
          lastErrorMessage: "API temporarily unavailable",
        },
      });

      const { embed } = liveTrackerEmbed;

      expect(embed.title).toContain("Live Tracker - Queue #42");
      expect(embed.description).toBeDefined();
      expect(embed.description).not.toBe("**Active**");
    });
  });

  describe("action components", () => {
    it("creates buttons for active state", () => {
      const liveTrackerEmbed = createLiveTrackerEmbed({
        status: "active",
        isPaused: false,
        seriesScore: "Team Alpha 1 - 0 Team Beta",
        enrichedMatches: [],
      });

      const { actions } = liveTrackerEmbed;

      expect(actions).toBeDefined();
      expect(actions.length).toBeGreaterThan(0);
    });

    it("creates buttons for paused state", () => {
      const liveTrackerEmbed = createLiveTrackerEmbed({
        status: "active",
        isPaused: true,
        seriesScore: "Team Alpha 1 - 0 Team Beta",
        enrichedMatches: [],
        nextCheck: undefined,
      });

      const { actions } = liveTrackerEmbed;

      expect(actions).toBeDefined();
      expect(actions.length).toBeGreaterThan(0);
    });

    it("creates no buttons for stopped state", () => {
      const liveTrackerEmbed = createLiveTrackerEmbed({
        status: "stopped",
        seriesScore: "Team Alpha 3 - 2 Team Beta",
        enrichedMatches: testEnrichedMatches,
        nextCheck: undefined,
      });

      const { actions } = liveTrackerEmbed;

      expect(actions).toHaveLength(0);
    });

    describe("repost button", () => {
      it("includes repost button for active state", () => {
        const liveTrackerEmbed = createLiveTrackerEmbed({
          status: "active",
          isPaused: false,
          seriesScore: "Team Alpha 1 - 0 Team Beta",
          enrichedMatches: [],
        });

        const { actions } = liveTrackerEmbed;

        expect(actions).toHaveLength(2);
        expect(actions[1]).toEqual({
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              custom_id: "btn_track_repost",
              label: "Move to bottom of chat",
              style: ButtonStyle.Secondary,
              emoji: { name: "⏬" },
            },
            /*
            {
              type: ComponentType.Button,
              label: "View in browser (BETA)",
              style: ButtonStyle.Link,
              emoji: { name: "🌐" },
              url: `https://guilty-spark.app/tracker?server=guild123&queue=42`,
            },
            */
          ],
        });
      });

      it("includes repost button for paused state", () => {
        const liveTrackerEmbed = createLiveTrackerEmbed({
          status: "active",
          isPaused: true,
          seriesScore: "Team Alpha 1 - 0 Team Beta",
          enrichedMatches: [],
          nextCheck: undefined,
        });

        const { actions } = liveTrackerEmbed;

        expect(actions).toHaveLength(2);
        expect(actions[1]).toEqual({
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              custom_id: "btn_track_repost",
              label: "Move to bottom of chat",
              style: ButtonStyle.Secondary,
              emoji: { name: "⏬" },
            },
            /*
            {
              type: ComponentType.Button,
              label: "View in browser (BETA)",
              style: ButtonStyle.Link,
              emoji: { name: "🌐" },
              url: `https://guilty-spark.app/tracker?server=guild123&queue=42`,
            },
            */
          ],
        });
      });

      it("does not include repost button for stopped state", () => {
        const liveTrackerEmbed = createLiveTrackerEmbed({
          status: "stopped",
          seriesScore: "Team Alpha 3 - 2 Team Beta",
          enrichedMatches: testEnrichedMatches,
          nextCheck: undefined,
        });

        const { actions } = liveTrackerEmbed;

        expect(actions).toHaveLength(0);
      });
    });
  });

  describe("series score formatting", () => {
    it("handles series score with emojis", () => {
      const liveTrackerEmbed = createLiveTrackerEmbed({
        status: "active",
        isPaused: false,
        seriesScore: "Team Alpha 2 - 1 Team Beta (🦅:🐍)",
        enrichedMatches: testEnrichedMatches,
      });

      const { embed } = liveTrackerEmbed;

      const scoreField = embed.fields?.find((field) => field.name.includes("Score"));
      expect(scoreField).toBeDefined();
      expect(scoreField?.name).toContain("🦅:🐍");
    });

    it("handles series score without emojis", () => {
      const liveTrackerEmbed = createLiveTrackerEmbed({
        status: "active",
        isPaused: false,
        seriesScore: "Team Alpha 1 - 0 Team Beta",
        enrichedMatches: testEnrichedMatches.slice(0, 1),
      });

      const { embed } = liveTrackerEmbed;

      const scoreField = embed.fields?.find((field) => field.name.includes("Score"));
      expect(scoreField).toBeDefined();
      expect(scoreField?.name).not.toContain("🦅:🐍");
    });
  });

  describe("timestamp formatting", () => {
    it("handles missing timestamps gracefully", () => {
      const liveTrackerEmbed = createLiveTrackerEmbed({
        status: "active",
        isPaused: false,
        seriesScore: "Team Alpha 0 - 0 Team Beta",
        enrichedMatches: [],
        lastUpdated: undefined,
        nextCheck: undefined,
      });

      const { embed } = liveTrackerEmbed;

      expect(embed.description).toBeDefined();
      expect(embed.description).toBe("**Live Tracking Active**");
    });
  });

  describe("substitutions", () => {
    it("interleaves substitutions with matches chronologically", () => {
      const liveTrackerEmbed = createLiveTrackerEmbed({
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
      });

      const { embed } = liveTrackerEmbed;

      const gameField = embed.fields?.find((field) => field.name === "Game");
      expect(gameField).toBeDefined();
      expect(gameField?.value).toContain("*<@player-in-1> subbed in for <@player-out-1> (Team Alpha)*");
      expect(gameField?.value).toContain("[Slayer on Aquarius]");
      expect(gameField?.value).toContain("[CTF on Catalyst]");
    });

    it("shows substitutions before first match when no matches yet", () => {
      const liveTrackerEmbed = createLiveTrackerEmbed({
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
      });

      const { embed } = liveTrackerEmbed;

      const statusField = embed.fields?.find((field) => field.name === "Status");
      expect(statusField).toBeDefined();
      expect(statusField?.value).toContain("*<@player-in-1> subbed in for <@player-out-1> (Team Alpha)*");
      expect(statusField?.value).toContain("⏳ *Waiting for first match to complete...*");
    });

    it("orders substitutions chronologically relative to match end times", () => {
      const enrichedMatches: LiveTrackerMatchSummary[] = [
        {
          matchId: "match-1",
          gameTypeAndMap: "Slayer on Aquarius",
          gameType: "Slayer",
          gameMap: "Aquarius",
          gameMapThumbnailUrl: "https://example.com/aquarius-thumb.png",
          duration: "8m 45s",
          gameScore: "50:42",
          gameSubScore: null,
          endTime: "2024-01-01T10:15:00Z",
        },
        {
          matchId: "match-2",
          gameTypeAndMap: "CTF on Catalyst",
          gameType: "CTF",
          gameMap: "Catalyst",
          gameMapThumbnailUrl: "https://example.com/catalyst-thumb.png",
          duration: "12m 30s",
          gameScore: "3:2",
          gameSubScore: null,
          endTime: "2024-01-01T10:30:00Z",
        },
        {
          matchId: "match-3",
          gameTypeAndMap: "Strongholds on Streets",
          gameType: "Strongholds",
          gameMap: "Streets",
          gameMapThumbnailUrl: "https://example.com/streets-thumb.png",
          duration: "15m 12s",
          gameScore: "250:200",
          gameSubScore: null,
          endTime: "2024-01-01T10:45:00Z",
        },
      ];

      const liveTrackerEmbed = createLiveTrackerEmbed({
        status: "active",
        isPaused: false,
        seriesScore: "🦅 2:1 🐍",
        enrichedMatches,
        substitutions: [
          {
            playerOutId: "player-out-1",
            playerInId: "player-in-1",
            teamIndex: 0,
            teamName: "Team Alpha",
            timestamp: "2024-01-01T10:10:00Z", // Before all matches
          },
          {
            playerOutId: "player-out-2",
            playerInId: "player-in-2",
            teamIndex: 1,
            teamName: "Team Beta",
            timestamp: "2024-01-01T10:20:00Z", // Between match 1 and 2
          },
          {
            playerOutId: "player-out-3",
            playerInId: "player-in-3",
            teamIndex: 0,
            teamName: "Team Alpha",
            timestamp: "2024-01-01T10:50:00Z", // After all matches
          },
        ],
      });

      const { embed } = liveTrackerEmbed;

      const gameField = embed.fields?.find((field) => field.name === "Game");
      expect(gameField).toBeDefined();

      const fieldValue = gameField?.value;
      expect(fieldValue).toBeDefined();

      // Verify all substitutions and matches are present
      expect(fieldValue).toContain("*<@player-in-1> subbed in for <@player-out-1> (Team Alpha)*");
      expect(fieldValue).toContain("*<@player-in-2> subbed in for <@player-out-2> (Team Beta)*");
      expect(fieldValue).toContain("*<@player-in-3> subbed in for <@player-out-3> (Team Alpha)*");
      expect(fieldValue).toContain("[Slayer on Aquarius]");
      expect(fieldValue).toContain("[CTF on Catalyst]");
      expect(fieldValue).toContain("[Strongholds on Streets]");

      // Verify chronological ordering
      const checkedFieldValue = Preconditions.checkExists(fieldValue);
      const sub1Index = checkedFieldValue.indexOf("*<@player-in-1> subbed in for <@player-out-1> (Team Alpha)*");
      const match1Index = checkedFieldValue.indexOf("[Slayer on Aquarius]");
      const sub2Index = checkedFieldValue.indexOf("*<@player-in-2> subbed in for <@player-out-2> (Team Beta)*");
      const match2Index = checkedFieldValue.indexOf("[CTF on Catalyst]");
      const match3Index = checkedFieldValue.indexOf("[Strongholds on Streets]");
      const sub3Index = checkedFieldValue.indexOf("*<@player-in-3> subbed in for <@player-out-3> (Team Alpha)*");

      // Expected order: sub1 -> match1 -> sub2 -> match2 -> match3 -> sub3
      expect(sub1Index).toBeLessThan(match1Index);
      expect(match1Index).toBeLessThan(sub2Index);
      expect(sub2Index).toBeLessThan(match2Index);
      expect(match2Index).toBeLessThan(match3Index);
      expect(match3Index).toBeLessThan(sub3Index);
    });
  });
});
