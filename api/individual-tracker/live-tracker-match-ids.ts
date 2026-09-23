import type { LiveTrackerService } from "../services/live-tracker/live-tracker";

export async function resolveLiveTrackerMatchIds(
  liveTrackerService: LiveTrackerService,
  guildId: string,
  queueNumber: number,
): Promise<string[]> {
  const status = await liveTrackerService.getTrackerStatusByQueue(guildId, queueNumber);
  if (status == null || status.state.status === "stopped") {
    return [];
  }

  return [...status.state.matchIds];
}
