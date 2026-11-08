import type { Services } from "../../services/install";
import type { HaloService } from "../../services/halo/halo";

export async function resolveTrackerHaloService(
  services: Pick<Services, "haloService" | "databaseService" | "userTokenProvider" | "logService">,
  trackerId: string | undefined,
  context: string,
): Promise<HaloService> {
  const { haloService, databaseService, userTokenProvider, logService } = services;
  if (trackerId == null) {
    return haloService;
  }

  try {
    const tracker = await databaseService.getIndividualTracker(trackerId);
    if (tracker?.IsLive === 1) {
      const userClient = await userTokenProvider.getClientForUser(tracker.UserId);
      if (userClient != null) {
        return haloService.withUserClient(userClient);
      }
    }
  } catch (error) {
    logService.error(
      error,
      new Map([
        ["context", context],
        ["trackerId", trackerId],
      ]),
    );
  }
  return haloService;
}
