import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import { trackerViewContract } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type {
  IndividualTrackerViewState,
  IndividualTrackerViewStateResponse,
} from "../../durable-objects/individual-tracker/types";
import type { RoutesRegisterHandler } from "../base/types";
import { toTrackerView } from "./mapper";

async function viewStateTrackerDo(
  env: Env,
  userId: string,
  trackerId: string,
): Promise<IndividualTrackerViewState | null> {
  const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${userId}:${trackerId}`);
  const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);
  const response = await stub.fetch("http://do/view-state", { method: "GET" });
  const result = await response.json<IndividualTrackerViewStateResponse>();
  return result.state;
}

export const trackerViewRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/individual-tracker/:trackerId/view", async (request, env: Env) => {
    const services = installServices({ env });
    const { databaseService, logService } = services;

    try {
      const trackerId = Preconditions.checkExists(request.params["trackerId"], "Missing trackerId");

      const row = await databaseService.getIndividualTracker(trackerId);
      if (row == null) {
        return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
      }

      const doState = await viewStateTrackerDo(env, row.UserId, trackerId);

      return trackerViewContract.toResponse({ view: toTrackerView(row, doState) }, { noStore: true });
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Individual tracker view error"]]));
      return errorContract.toResponse({ error: "Failed to fetch tracker view" }, { status: 500, noStore: true });
    }
  });
};
