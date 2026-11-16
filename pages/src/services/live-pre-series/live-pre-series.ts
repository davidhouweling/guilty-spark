import { discordSeriesStatsParamsSchema } from "@guilty-spark/shared/contracts/stats/discord-series";
import { livePreSeriesContract } from "@guilty-spark/shared/contracts/stats/pre-series";
import type { LivePreSeriesResponse } from "@guilty-spark/shared/contracts/stats/pre-series";
import { createApiUrl } from "../api-url";
import type { LivePreSeriesIdentity, LivePreSeriesService } from "./types";

interface Config {
  readonly apiHost: string;
}

export class RealLivePreSeriesService implements LivePreSeriesService {
  public constructor(private readonly config: Config) {}

  public async getCapturedRoster(identity: LivePreSeriesIdentity): Promise<LivePreSeriesResponse> {
    const { guildId, queueNumber } = discordSeriesStatsParamsSchema.parse(identity);
    const url = createApiUrl(this.config.apiHost, `/api/stats/discord/${guildId}/${queueNumber.toString()}/pre-series`);
    const response = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
    const data = await livePreSeriesContract.fromResponse(response);
    const expectedStatus = data.status === "resolved" ? 200 : 404;
    if (response.status !== expectedStatus) {
      throw new Error(`Unexpected live pre-series response status: ${response.status.toString()}`);
    }
    if (data.status === "resolved" && (data.guildId !== guildId || data.queueNumber !== queueNumber)) {
      throw new Error("Unexpected live pre-series response identity");
    }
    return data;
  }
}
