import {
  discordSeriesStatsContract,
  type DiscordSeriesStats,
} from "@guilty-spark/shared/contracts/stats/discord-series";

export async function fetchDiscordSeriesStats(url: string): Promise<{
  status: number;
  data: DiscordSeriesStats;
}> {
  const response = await fetch(url);
  const data = await discordSeriesStatsContract.fromResponse(response);

  return {
    status: response.status,
    data,
  };
}
