import type { DiscordSeriesStatsResolved } from "@guilty-spark/shared/contracts/stats/discord-series";
import type {
  DiscordSeriesStatsLookupResult,
  DiscordSeriesStatsResult,
  DiscordSeriesStatsService,
} from "../discord-series-types";

interface FakeDiscordSeriesStatsServiceOptions {
  readonly result: DiscordSeriesStatsResult;
  readonly lookupResult: DiscordSeriesStatsLookupResult;
}

function aFakeResolvedDataWith(): DiscordSeriesStatsResolved {
  return {
    status: "resolved",
    guildId: "123456789012345678",
    queueNumber: 7777,
    matchIds: ["fake-match-1"],
    renderData: {
      title: "Queue #7777 Series Stats",
      subtitle: "Guild 123456789012345678",
      seriesScore: "1:0",
      teams: [
        { name: "Eagle", players: ["Player One"] },
        { name: "Cobra", players: ["Player Two"] },
      ],
      matches: [
        {
          matchId: "fake-match-1",
          gameTypeAndMap: "Slayer: Live Fire",
          gameVariantCategory: 0,
          gameType: "Slayer",
          gameMap: "Live Fire",
          gameMapThumbnailUrl: "data:,",
          duration: "10m 00s",
          gameScore: "50:45",
          gameSubScore: null,
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:10:00.000Z",
          playerXuidToGametag: { "xuid-1": "Player One" },
          rawMatch: {},
        },
      ],
    },
  };
}

export function aFakeDiscordSeriesStatsResultWith(
  overrides: Partial<DiscordSeriesStatsResult> = {},
): DiscordSeriesStatsResult {
  return {
    status: 200,
    data: aFakeResolvedDataWith(),
    retryAfterSeconds: null,
    ...overrides,
  };
}

export function aFakeDiscordSeriesStatsLookupResultWith(
  overrides: Partial<DiscordSeriesStatsLookupResult> = {},
): DiscordSeriesStatsLookupResult {
  return {
    status: 200,
    retryAfterSeconds: null,
    ...overrides,
  };
}

export class FakeDiscordSeriesStatsService implements DiscordSeriesStatsService {
  private readonly result: DiscordSeriesStatsResult;
  private readonly lookupResult: DiscordSeriesStatsLookupResult;

  constructor(options?: Partial<FakeDiscordSeriesStatsServiceOptions>) {
    this.result = options?.result ?? aFakeDiscordSeriesStatsResultWith();
    this.lookupResult = options?.lookupResult ?? aFakeDiscordSeriesStatsLookupResultWith();
  }

  async getStats(guildId: string, queueNumber: string): Promise<DiscordSeriesStatsResult> {
    void guildId;
    void queueNumber;
    return Promise.resolve(this.result);
  }

  async getLookup(guildId: string, queueNumber: string): Promise<DiscordSeriesStatsLookupResult> {
    void guildId;
    void queueNumber;
    return Promise.resolve(this.lookupResult);
  }
}

export function aFakeDiscordSeriesStatsServiceWith(
  overrides: Partial<FakeDiscordSeriesStatsServiceOptions> = {},
): FakeDiscordSeriesStatsService {
  return new FakeDiscordSeriesStatsService(overrides);
}
