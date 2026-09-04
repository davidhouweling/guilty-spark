import { LEADERBOARD_MAX_PAGE_SIZE, leaderboardContract } from "@guilty-spark/shared/contracts/leaderboard/leaderboard";
import { leaderboardQueuesContract } from "@guilty-spark/shared/contracts/leaderboard/leaderboard-queues";
import type { LeaderboardResponse } from "@guilty-spark/shared/contracts/leaderboard/leaderboard";
import type { LeaderboardService, LeaderboardRequest, LeaderboardQueueOptionsResponse } from "./leaderboard-types";

interface RealLeaderboardServiceOptions {
  readonly apiHost: string;
}

export class RealLeaderboardService implements LeaderboardService {
  private readonly apiHost: string;

  constructor({ apiHost }: RealLeaderboardServiceOptions) {
    this.apiHost = apiHost;
  }

  async getLeaderboard({ guildId, queueChannelId, window, metric }: LeaderboardRequest): Promise<LeaderboardResponse> {
    const url = new URL("/api/leaderboard", this.apiHost);
    url.searchParams.set("guildId", guildId);
    url.searchParams.set("pageSize", LEADERBOARD_MAX_PAGE_SIZE.toString());
    if (queueChannelId != null) {
      url.searchParams.set("queueChannelId", queueChannelId);
    }
    if (window != null) {
      url.searchParams.set("window", window);
    }
    if (metric != null) {
      url.searchParams.set("metric", metric);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Leaderboard request failed with status ${response.status.toString()}`);
    }
    return await leaderboardContract.fromResponse(response);
  }

  async getQueueOptions(guildId: string): Promise<LeaderboardQueueOptionsResponse> {
    const url = new URL("/api/leaderboard/queues", this.apiHost);
    url.searchParams.set("guildId", guildId);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Leaderboard queue request failed with status ${response.status.toString()}`);
    }
    const data = await leaderboardQueuesContract.fromResponse(response);
    return { guildName: data.guildName, options: data.queueOptions };
  }
}
