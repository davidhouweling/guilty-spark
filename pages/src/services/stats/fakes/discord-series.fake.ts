import type { DiscordSeriesStatsResolved } from "@guilty-spark/shared/contracts/stats/discord-series";
import { sampleLiveTrackerStateMessage } from "@guilty-spark/shared/live-tracker/fakes/data";
import type { LiveTrackerMatchSummary } from "@guilty-spark/shared/live-tracker/types";
import { isMatchStats } from "../../../controllers/stats/is-match-stats";
import type {
  DiscordSeriesStatsLookupResult,
  DiscordSeriesStatsResult,
  DiscordSeriesStatsService,
} from "../discord-series-types";

interface FakeDiscordSeriesStatsServiceOptions {
  readonly result: DiscordSeriesStatsResult;
  readonly lookupResult: DiscordSeriesStatsLookupResult;
}

function getPlayerDisplayName(playerId: string): string {
  const association = sampleLiveTrackerStateMessage.data.playersAssociationData?.[playerId];
  if (association?.gamertag != null && association.gamertag !== "") {
    return association.gamertag;
  }

  const player = sampleLiveTrackerStateMessage.data.players.find((candidate) => candidate.id === playerId);
  return player?.discordUsername ?? playerId;
}

function getGameVariantCategory(match: LiveTrackerMatchSummary): number {
  const rawMatch = sampleLiveTrackerStateMessage.data.rawMatches[match.matchId];
  return isMatchStats(rawMatch) ? rawMatch.MatchInfo.GameVariantCategory : 0;
}

function aFakeResolvedDataWith(): DiscordSeriesStatsResolved {
  const state = sampleLiveTrackerStateMessage.data;
  const matches = state.matchSummaries;

  return {
    status: "resolved",
    guildId: state.guildId,
    queueNumber: state.queueNumber,
    matchIds: matches.map((match) => match.matchId),
    renderData: {
      title: `Queue #${state.queueNumber.toString()} Series Stats`,
      subtitle: state.guildName,
      seriesScore: state.seriesScore,
      teams: state.teams.map((team) => ({
        name: team.name,
        players: team.playerIds.map(getPlayerDisplayName),
      })),
      matches: matches.map((match) => ({
        ...match,
        gameVariantCategory: getGameVariantCategory(match),
        rawMatch: state.rawMatches[match.matchId] ?? {},
      })),
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

  async getStats(): Promise<DiscordSeriesStatsResult> {
    return Promise.resolve(this.result);
  }

  async getLookup(): Promise<DiscordSeriesStatsLookupResult> {
    return Promise.resolve(this.lookupResult);
  }
}

export function aFakeDiscordSeriesStatsServiceWith(
  overrides: Partial<FakeDiscordSeriesStatsServiceOptions> = {},
): FakeDiscordSeriesStatsService {
  return new FakeDiscordSeriesStatsService(overrides);
}
