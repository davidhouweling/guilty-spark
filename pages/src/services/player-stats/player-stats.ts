import { playerStatsContract } from "@guilty-spark/shared/contracts/stats/player";
import type { PlayerStatsResponse } from "@guilty-spark/shared/contracts/stats/player";
import type { PlayerStatsRequest, PlayerStatsService } from "./player-stats-types";

interface RealPlayerStatsServiceOptions {
  readonly apiHost: string;
}

export class RealPlayerStatsService implements PlayerStatsService {
  private readonly apiHost: string;

  constructor({ apiHost }: RealPlayerStatsServiceOptions) {
    this.apiHost = apiHost;
  }

  async getPlayerStats({
    gamertag,
    guildId,
    queueChannelId,
    window,
  }: PlayerStatsRequest): Promise<PlayerStatsResponse> {
    const url = new URL(`/api/stats/player/${encodeURIComponent(gamertag)}`, this.apiHost);
    if (guildId != null) {
      url.searchParams.set("guildId", guildId);
    }
    if (queueChannelId != null) {
      url.searchParams.set("queueChannelId", queueChannelId);
    }
    if (window != null) {
      url.searchParams.set("window", window);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Player stats request failed with status ${response.status.toString()}`);
    }
    return await playerStatsContract.fromResponse(response);
  }
}
