import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import {
  startTrackerRequestSchema,
  stopTrackerContract,
  trackerContract,
  trackersContract,
} from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import { parseJsonBody } from "@guilty-spark/shared/base/request-parsing";
import type {
  IndividualTrackerStartRequest,
  IndividualTrackerStartResponse,
  IndividualTrackerStatusResponse,
  IndividualTrackerStopResponse,
  IndividualTrackerStateSanitized,
} from "../../durable-objects/individual-tracker/types";
import type { IndividualTrackersRow } from "../../services/database/types/individual_trackers";
import { TrackerLimitReachedError, TrackerNotFoundError } from "../../services/individual-tracker/errors";
import type { CreateTrackerOptions } from "../../services/individual-tracker/types";
import type { RoutesRegisterHandler } from "../base/types";
import { requireSession } from "../base/require-session";
import { toTracker } from "./mapper";

const DEFAULT_IDLE_TIMEOUT_HOURS = 6;

function trackerDoStub(env: Env, userId: string, trackerId: string): DurableObjectStub {
  const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${userId}:${trackerId}`);
  return env.INDIVIDUAL_TRACKER_DO.get(doId);
}

async function startTrackerDo(
  env: Env,
  startRequest: IndividualTrackerStartRequest,
): Promise<IndividualTrackerStateSanitized> {
  const stub = trackerDoStub(env, startRequest.userId, startRequest.trackerId);
  const response = await stub.fetch("http://do/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(startRequest),
  });
  const result = await response.json<IndividualTrackerStartResponse>();
  return result.state;
}

async function stopTrackerDo(env: Env, userId: string, trackerId: string): Promise<void> {
  const stub = trackerDoStub(env, userId, trackerId);
  const response = await stub.fetch("http://do/stop", { method: "POST" });
  await response.json<IndividualTrackerStopResponse>();
}

async function statusTrackerDo(
  env: Env,
  userId: string,
  trackerId: string,
): Promise<IndividualTrackerStateSanitized | null> {
  const stub = trackerDoStub(env, userId, trackerId);
  const response = await stub.fetch("http://do/status", { method: "GET" });
  const result = await response.json<IndividualTrackerStatusResponse>();
  return result.state;
}

export const trackerManageRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  router.post("/api/individual-tracker/manage/start", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, individualTrackerService, xboxService, logService } = services;

    try {
      const auth = await requireSession(request, authService);
      if (!auth.ok) {
        return auth.response;
      }

      const parsed = await parseJsonBody(request, startTrackerRequestSchema, "Invalid start tracker request");
      if (!parsed.success) {
        return parsed.response;
      }

      const xboxUser = await xboxService.getUserByGamertag(parsed.data.gamertag);

      const createOptions: CreateTrackerOptions = {
        userId: auth.session.userId,
        gamertag: xboxUser.gamertag,
        xuid: xboxUser.xuid,
      };

      let tracker: IndividualTrackersRow;
      try {
        tracker = await individualTrackerService.createTracker(createOptions);
      } catch (error) {
        if (error instanceof TrackerLimitReachedError) {
          return errorContract.toResponse(
            { error: "Tracker limit reached (maximum 5 gamertags)" },
            { status: 429, noStore: true },
          );
        }
        throw error;
      }

      const startRequest: IndividualTrackerStartRequest = {
        userId: auth.session.userId,
        trackerId: tracker.TrackerId,
        xuid: tracker.Xuid,
        gamertag: tracker.Gamertag,
        searchStartTime: parsed.data.searchStartTime ?? new Date().toISOString(),
        idleTimeoutHours: parsed.data.idleTimeoutHours ?? DEFAULT_IDLE_TIMEOUT_HOURS,
      };

      const state = await startTrackerDo(env, startRequest);

      return trackerContract.toResponse({ tracker: toTracker(tracker, state) }, { noStore: true });
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Individual tracker start error"]]));
      return errorContract.toResponse({ error: "Failed to start tracker" }, { status: 500, noStore: true });
    }
  });

  router.post("/api/individual-tracker/:trackerId/stop", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, individualTrackerService, logService } = services;

    try {
      const auth = await requireSession(request, authService);
      if (!auth.ok) {
        return auth.response;
      }

      const trackerId = Preconditions.checkExists(request.params["trackerId"], "Missing trackerId");

      let tracker: IndividualTrackersRow;
      try {
        tracker = await individualTrackerService.getOwnedTracker(auth.session.userId, trackerId);
      } catch (error) {
        if (error instanceof TrackerNotFoundError) {
          return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
        }
        throw error;
      }

      await stopTrackerDo(env, auth.session.userId, tracker.TrackerId);
      await individualTrackerService.markTrackerStopped(tracker);

      return stopTrackerContract.toResponse({ success: true }, { noStore: true });
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Individual tracker stop error"]]));
      return errorContract.toResponse({ error: "Failed to stop tracker" }, { status: 500, noStore: true });
    }
  });

  router.get("/api/individual-tracker/manage/trackers", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, individualTrackerService, logService } = services;

    try {
      const auth = await requireSession(request, authService);
      if (!auth.ok) {
        return auth.response;
      }

      const rows = await individualTrackerService.listTrackers(auth.session.userId);
      const trackers = await Promise.all(
        rows.map(async (row) => {
          const state = await statusTrackerDo(env, auth.session.userId, row.TrackerId);
          return toTracker(row, state);
        }),
      );

      return trackersContract.toResponse({ trackers }, { noStore: true });
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Individual tracker list error"]]));
      return errorContract.toResponse({ error: "Failed to list trackers" }, { status: 500, noStore: true });
    }
  });

  router.get("/api/individual-tracker/:trackerId/status", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, individualTrackerService, logService } = services;

    try {
      const auth = await requireSession(request, authService);
      if (!auth.ok) {
        return auth.response;
      }

      const trackerId = Preconditions.checkExists(request.params["trackerId"], "Missing trackerId");

      let tracker: IndividualTrackersRow;
      try {
        tracker = await individualTrackerService.getOwnedTracker(auth.session.userId, trackerId);
      } catch (error) {
        if (error instanceof TrackerNotFoundError) {
          return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
        }
        throw error;
      }

      const state = await statusTrackerDo(env, auth.session.userId, tracker.TrackerId);

      return trackerContract.toResponse({ tracker: toTracker(tracker, state) }, { noStore: true });
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Individual tracker status error"]]));
      return errorContract.toResponse({ error: "Failed to fetch tracker status" }, { status: 500, noStore: true });
    }
  });
};
