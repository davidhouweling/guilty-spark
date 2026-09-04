import { leaderboardContract } from "@guilty-spark/shared/contracts/leaderboard/leaderboard";
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
    const query = new URLSearchParams({ guildId, pageSize: "500" });
    if (queueChannelId != null) {
      query.set("queueChannelId", queueChannelId);
    }
    if (window != null) {
      query.set("window", window);
    }
    if (metric != null) {
      query.set("metric", metric);
    }

    const response = await fetch(`${this.apiHost}/api/leaderboard?${query.toString()}`);
    if (!response.ok) {
      throw new Error(`Leaderboard request failed with status ${response.status.toString()}`);
    }
    return await leaderboardContract.fromResponse(response);
  }

  async getQueueOptions(guildId: string): Promise<LeaderboardQueueOptionsResponse> {
    const query = new URLSearchParams({ guildId });
    const response = await fetch(`${this.apiHost}/api/leaderboard/queues?${query.toString()}`);
    if (!response.ok) {
      throw new Error(`Leaderboard queue request failed with status ${response.status.toString()}`);
    }
    const data = await leaderboardQueuesContract.fromResponse(response);
    return { guildName: data.guildName, options: data.queueOptions };
  }
}
