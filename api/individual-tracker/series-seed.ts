import type { IndividualTrackerSeriesSeed } from "@guilty-spark/shared/contracts/durable-objects/individual-tracker/lifecycle";
import type { LiveTrackerService } from "../services/live-tracker/live-tracker";
import type { LogService } from "../services/log/types";
import type { NeatQueueService } from "../services/neatqueue/neatqueue";
import type { ActiveSeriesForPlayer } from "../services/neatqueue/types";

export interface ResolveSeriesSeedOpts {
  neatQueueService: NeatQueueService;
  liveTrackerService: LiveTrackerService;
  logService: LogService;
  xuid: string;
  gamertag: string;
}

async function resolveSeriesMatchIds(
  opts: ResolveSeriesSeedOpts,
  activeSeries: ActiveSeriesForPlayer,
): Promise<string[]> {
  const { liveTrackerService, logService } = opts;

  try {
    const status = await liveTrackerService.getTrackerStatusByQueue(activeSeries.guildId, activeSeries.queueNumber);
    if (status == null || status.state.status === "stopped") {
      return [];
    }

    return [...status.state.matchIds];
  } catch (error) {
    logService.warn(
      "resolveSeriesSeed: failed to fetch live tracker matches, seeding series without matches",
      new Map([
        ["guildId", activeSeries.guildId],
        ["queueNumber", activeSeries.queueNumber.toString()],
        ["error", String(error)],
      ]),
    );
    return [];
  }
}

export async function resolveSeriesSeed(opts: ResolveSeriesSeedOpts): Promise<IndividualTrackerSeriesSeed | null> {
  const { neatQueueService, logService, xuid, gamertag } = opts;

  try {
    const activeSeries = await neatQueueService.findActiveSeriesForPlayer(xuid, gamertag);
    if (activeSeries == null) {
      return null;
    }

    const matchIds = await resolveSeriesMatchIds(opts, activeSeries);
    const { seriesContext } = activeSeries;

    return {
      title: seriesContext.title,
      subtitle: seriesContext.subtitle,
      guildIconUrl: seriesContext.guildIconUrl,
      startedAt: seriesContext.startedAt ?? new Date().toISOString(),
      ...(seriesContext.searchStartTime != null ? { searchStartTime: seriesContext.searchStartTime } : {}),
      teams: seriesContext.teams,
      matchIds,
    };
  } catch (error) {
    logService.warn(
      "resolveSeriesSeed: failed to resolve active series, starting tracker without seed",
      new Map([
        ["gamertag", gamertag],
        ["error", String(error)],
      ]),
    );
    return null;
  }
}
