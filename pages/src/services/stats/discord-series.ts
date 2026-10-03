import { discordSeriesStatsContract } from "@guilty-spark/shared/contracts/stats/discord-series";
import type {
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

  async getStats(guildId: string, queueNumber: string, seriesId?: string): Promise<DiscordSeriesStatsResult> {
    const seriesIdQuery = seriesId == null ? "" : `?seriesId=${encodeURIComponent(seriesId)}`;
    const response = await fetch(`${this.apiHost}/api/stats/discord/${guildId}/${queueNumber}${seriesIdQuery}`);

    return parseDiscordSeriesStatsResponse(response);
  }

  async getLookup(guildId: string, queueNumber: string, seriesId?: string): Promise<DiscordSeriesStatsLookupResult> {
    const seriesIdQuery = seriesId == null ? "" : `?seriesId=${encodeURIComponent(seriesId)}`;
    const response = await fetch(`${this.apiHost}/api/stats/discord/${guildId}/${queueNumber}/lookup${seriesIdQuery}`);
    await discardResponseBody(response);

    return parseDiscordSeriesStatsLookupResponse(response);
  }
}
