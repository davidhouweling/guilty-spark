import { discordSeriesStatsContract } from "@guilty-spark/shared/contracts/stats/discord-series";
import { seriesDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import type {
  DiscordSeriesStatsDetailResult,
  DiscordSeriesStatsLookupResult,
  DiscordSeriesStatsResult,
  DiscordSeriesStatsService,
} from "./discord-series-types";

interface RealDiscordSeriesStatsServiceOptions {
  readonly apiHost: string;
}

function parseRetryAfterHeader(value: string | null): number | null {
  if (value == null) {
    return null;
  }

  const normalizedValue = value.trim();
  if (!/^\d+$/.test(normalizedValue)) {
    return null;
  }

  const parsed = Number(normalizedValue);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

async function parseDiscordSeriesStatsResponse(response: Response): Promise<DiscordSeriesStatsResult> {
  const data = await discordSeriesStatsContract.fromResponse(response);

  return {
    status: response.status,
    data,
    retryAfterSeconds: parseRetryAfterHeader(response.headers.get("Retry-After")),
  };
}

async function parseDiscordSeriesStatsDetailResponse(response: Response): Promise<DiscordSeriesStatsDetailResult> {
  const retryAfterSeconds = parseRetryAfterHeader(response.headers.get("Retry-After"));
  if (response.status === 200) {
    const data = await seriesDetailContract.fromResponse(response);
    return { status: response.status, data, retryAfterSeconds };
  }

  const data = await discordSeriesStatsContract.fromResponse(response);
  if (data.status === "resolved") {
    throw new Error("Unexpected resolved stats response from Discord series detail endpoint");
  }

  return { status: response.status, data, retryAfterSeconds };
}

function parseDiscordSeriesStatsLookupResponse(response: Response): DiscordSeriesStatsLookupResult {
  return {
    status: response.status,
    retryAfterSeconds: parseRetryAfterHeader(response.headers.get("Retry-After")),
  };
}

async function discardResponseBody(response: Response): Promise<void> {
  if (response.body == null) {
    return;
  }

  await response.body.cancel().catch(() => undefined);
}

export class RealDiscordSeriesStatsService implements DiscordSeriesStatsService {
  private readonly apiHost: string;

  constructor({ apiHost }: RealDiscordSeriesStatsServiceOptions) {
    this.apiHost = apiHost;
  }

  async getStats(guildId: string, queueNumber: string): Promise<DiscordSeriesStatsResult> {
    const response = await fetch(`${this.apiHost}/api/stats/discord/${guildId}/${queueNumber}`);

    return parseDiscordSeriesStatsResponse(response);
  }

  async getDetail(guildId: string, queueNumber: string): Promise<DiscordSeriesStatsDetailResult> {
    const response = await fetch(`${this.apiHost}/api/stats/discord/${guildId}/${queueNumber}/detail`);

    return parseDiscordSeriesStatsDetailResponse(response);
  }

  async getLookup(guildId: string, queueNumber: string): Promise<DiscordSeriesStatsLookupResult> {
    const response = await fetch(`${this.apiHost}/api/stats/discord/${guildId}/${queueNumber}/lookup`);
    await discardResponseBody(response);

    return parseDiscordSeriesStatsLookupResponse(response);
  }
}
