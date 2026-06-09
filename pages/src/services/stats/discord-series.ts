import {
  discordSeriesStatsContract,
  type DiscordSeriesStats,
} from "@guilty-spark/shared/contracts/stats/discord-series";

function parseRetryAfterHeader(value: string | null): number | null {
  if (value == null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export async function fetchDiscordSeriesStats(url: string): Promise<{
  status: number;
  data: DiscordSeriesStats;
  retryAfterSeconds: number | null;
}> {
  const response = await fetch(url);
  const data = await discordSeriesStatsContract.fromResponse(response);

  return {
    status: response.status,
    data,
    retryAfterSeconds: parseRetryAfterHeader(response.headers.get("Retry-After")),
  };
}
