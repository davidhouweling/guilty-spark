import { installDiscordSeriesStatsService } from "../../services/stats/install";
import type { DiscordSeriesStatsService } from "../../services/stats/discord-series-types";

export interface Services {
  readonly discordSeriesStatsService: DiscordSeriesStatsService;
}

export async function installServices(apiHost: string): Promise<Services> {
  return {
    discordSeriesStatsService: await installDiscordSeriesStatsService(apiHost),
  };
}
