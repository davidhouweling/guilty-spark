import { playerCompareContract } from "@guilty-spark/shared/contracts/stats/player";
import type { PlayerCompareResponse } from "@guilty-spark/shared/contracts/stats/player";
import type { PlayerCompareRequest, PlayerCompareService } from "./player-compare-types";

interface RealPlayerCompareServiceOptions {
  readonly apiHost: string;
}

export class RealPlayerCompareService implements PlayerCompareService {
  private readonly apiHost: string;

  constructor({ apiHost }: RealPlayerCompareServiceOptions) {
    this.apiHost = apiHost;
  }

  async getPlayerCompare({
    gamertags,
    guildId,
    queueChannelId,
    window,
    minGamesPlayed,
  }: PlayerCompareRequest): Promise<PlayerCompareResponse> {
    const url = new URL("/api/stats/compare", this.apiHost);
    for (const gamertag of gamertags) {
      url.searchParams.append("gamertag", gamertag);
    }
    if (guildId != null) {
      url.searchParams.set("guildId", guildId);
    }
    if (queueChannelId != null) {
      url.searchParams.set("queueChannelId", queueChannelId);
    }
    if (window != null) {
      url.searchParams.set("window", window);
    }
    if (minGamesPlayed != null) {
      url.searchParams.set("minGamesPlayed", minGamesPlayed.toString());
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Player compare request failed with status ${response.status.toString()}`);
    }
    return await playerCompareContract.fromResponse(response);
  }
}
