import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { LEADERBOARD_MAX_PAGE_SIZE } from "@guilty-spark/shared/contracts/leaderboard/leaderboard";
import type { LeaderboardResponse } from "@guilty-spark/shared/contracts/leaderboard/leaderboard";
import type { LeaderboardQueueOptionsResponse, LeaderboardRequest, LeaderboardService } from "../leaderboard-types";

const defaultResponse: LeaderboardResponse = {
  guildId: "guild-1",
  queueChannelId: null,
  window: LeaderboardWindow.ThreeMonths,
  resetAt: null,
  metric: LeaderboardMetric.Kills,
  minGamesPlayed: 5,
  page: 1,
  pageSize: LEADERBOARD_MAX_PAGE_SIZE,
  total: 0,
  hasLeaderboardData: true,
  rows: [],
};

export function aFakeLeaderboardServiceWith(overrides: Partial<LeaderboardResponse> = {}): LeaderboardService {
  const response = { ...defaultResponse, ...overrides };
  return {
    getLeaderboard: async (request: LeaderboardRequest): Promise<LeaderboardResponse> =>
      Promise.resolve({
        ...response,
        guildId: request.guildId,
        queueChannelId: request.queueChannelId,
      }),
    getQueueOptions: async (): Promise<LeaderboardQueueOptionsResponse> => {
      return Promise.resolve({ guildName: "Guild 1", options: [] });
    },
  };
}
