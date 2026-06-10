import { getMode } from "../mode";
import type { DiscordSeriesStatsService } from "./discord-series-types";
import { RealDiscordSeriesStatsService } from "./discord-series";

export async function installDiscordSeriesStatsService(apiHost: string): Promise<DiscordSeriesStatsService> {
  if (getMode() === "FAKE") {
    const { aFakeDiscordSeriesStatsServiceWith } = await import("./fakes/discord-series.fake");
    return aFakeDiscordSeriesStatsServiceWith();
  }

  return new RealDiscordSeriesStatsService({ apiHost });
}
