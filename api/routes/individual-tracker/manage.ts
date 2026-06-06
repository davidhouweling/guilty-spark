import { errorContract } from "@guilty-spark/shared/contracts/error";
import {
  selectMatchesContract,
  selectMatchesRequestSchema,
  selectActiveTrackerRequestSchema,
  startTrackerRequestSchema,
  stopTrackerContract,
  trackerContract,
  trackerParamsSchema,
  trackersContract,
} from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import { parseJsonBody, parsePathParams } from "@guilty-spark/shared/base/request-parsing";
import type {
  IndividualTrackerPauseResponse,
  IndividualTrackerResumeResponse,
  IndividualTrackerStartRequest,
  IndividualTrackerStartResponse,
  IndividualTrackerState,
  IndividualTrackerStatusResponse,
  IndividualTrackerStopResponse,
  IndividualTrackerSelectMatchesResponse,
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

function assertDoOk(response: Response): void {
  if (!response.ok) {
    throw new Error(`DO request failed with status ${response.status.toString()}`);
  }
}

async function startTrackerDo(env: Env, startRequest: IndividualTrackerStartRequest): Promise<IndividualTrackerState> {
  const stub = trackerDoStub(env, startRequest.userId, startRequest.trackerId);
  const response = await stub.fetch("http://do/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(startRequest),
  });
  assertDoOk(response);
  const result = await response.json<IndividualTrackerStartResponse>();
  return result.state;
}

async function pauseTrackerDo(env: Env, userId: string, trackerId: string): Promise<IndividualTrackerState> {
  const stub = trackerDoStub(env, userId, trackerId);
  const response = await stub.fetch("http://do/pause", { method: "POST" });
  assertDoOk(response);
  const result = await response.json<IndividualTrackerPauseResponse>();
  return result.state;
}

async function resumeTrackerDo(env: Env, userId: string, trackerId: string): Promise<IndividualTrackerState> {
  const stub = trackerDoStub(env, userId, trackerId);
  const response = await stub.fetch("http://do/resume", { method: "POST" });
  assertDoOk(response);
  const result = await response.json<IndividualTrackerResumeResponse>();
  return result.state;
}

async function stopTrackerDo(env: Env, userId: string, trackerId: string): Promise<void> {
  const stub = trackerDoStub(env, userId, trackerId);
  const response = await stub.fetch("http://do/stop", { method: "POST" });
  assertDoOk(response);
  await response.json<IndividualTrackerStopResponse>();
}

async function statusTrackerDo(env: Env, userId: string, trackerId: string): Promise<IndividualTrackerState | null> {
  const stub = trackerDoStub(env, userId, trackerId);
  const response = await stub.fetch("http://do/status", { method: "GET" });
  assertDoOk(response);
  const result = await response.json<IndividualTrackerStatusResponse>();
  return result.state;
}

function assertDoOkWith404(response: Response): void {
  if (response.status === 404) {
    throw new TrackerNotFoundError();
  }
  assertDoOk(response);
}

async function syncMatchesDo(env: Env, userId: string, trackerId: string, matchIds: string[]): Promise<void> {
  const stub = trackerDoStub(env, userId, trackerId);
  const response = await stub.fetch("http://do/select-matches", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matchIds }),
  });
  assertDoOkWith404(response);
  await response.json<IndividualTrackerSelectMatchesResponse>();
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

      let xboxUser: Awaited<ReturnType<typeof xboxService.getUserByGamertag>>;
      try {
        xboxUser = await xboxService.getUserByGamertag(parsed.data.gamertag);
      } catch (error) {
        logService.warn(
          "Individual tracker start: gamertag lookup failed",
          new Map([
            ["gamertag", parsed.data.gamertag],
            ["error", String(error)],
          ]),
        );
        return errorContract.toResponse({ error: "Gamertag not found" }, { status: 404, noStore: true });
      }

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

      const parsedParams = parsePathParams(request.params, trackerParamsSchema, "Invalid tracker id");
      if (!parsedParams.success) {
        return parsedParams.response;
      }
      const { trackerId } = parsedParams.data;

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
      await individualTrackerService.markTrackerStatus(tracker, "stopped");

      return stopTrackerContract.toResponse({ success: true }, { noStore: true });
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Individual tracker stop error"]]));
      return errorContract.toResponse({ error: "Failed to stop tracker" }, { status: 500, noStore: true });
    }
  });

  router.post("/api/individual-tracker/:trackerId/pause", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, individualTrackerService, logService } = services;

    try {
      const auth = await requireSession(request, authService);
      if (!auth.ok) {
        return auth.response;
      }

      const parsedParams = parsePathParams(request.params, trackerParamsSchema, "Invalid tracker id");
      if (!parsedParams.success) {
        return parsedParams.response;
      }
      const { trackerId } = parsedParams.data;

      let tracker: IndividualTrackersRow;
      try {
        tracker = await individualTrackerService.getOwnedTracker(auth.session.userId, trackerId);
      } catch (error) {
        if (error instanceof TrackerNotFoundError) {
          return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
        }
        throw error;
      }

      const state = await pauseTrackerDo(env, auth.session.userId, tracker.TrackerId);
      const paused = await individualTrackerService.markTrackerStatus(tracker, "paused");

      return trackerContract.toResponse({ tracker: toTracker(paused, state) }, { noStore: true });
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Individual tracker pause error"]]));
      return errorContract.toResponse({ error: "Failed to pause tracker" }, { status: 500, noStore: true });
    }
  });

  router.post("/api/individual-tracker/:trackerId/resume", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, individualTrackerService, logService } = services;

    try {
      const auth = await requireSession(request, authService);
      if (!auth.ok) {
        return auth.response;
      }

      const parsedParams = parsePathParams(request.params, trackerParamsSchema, "Invalid tracker id");
      if (!parsedParams.success) {
        return parsedParams.response;
      }
      const { trackerId } = parsedParams.data;

      let tracker: IndividualTrackersRow;
      try {
        tracker = await individualTrackerService.getOwnedTracker(auth.session.userId, trackerId);
      } catch (error) {
        if (error instanceof TrackerNotFoundError) {
          return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
        }
        throw error;
      }

      const state = await resumeTrackerDo(env, auth.session.userId, tracker.TrackerId);
      const resumed = await individualTrackerService.markTrackerStatus(tracker, "active");

      return trackerContract.toResponse({ tracker: toTracker(resumed, state) }, { noStore: true });
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Individual tracker resume error"]]));
      return errorContract.toResponse({ error: "Failed to resume tracker" }, { status: 500, noStore: true });
    }
  });

  router.post("/api/individual-tracker/manage/select-active", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, individualTrackerService, logService } = services;

    try {
      const auth = await requireSession(request, authService);
      if (!auth.ok) {
        return auth.response;
      }

      const parsed = await parseJsonBody(
        request,
        selectActiveTrackerRequestSchema,
        "Invalid select active tracker request",
      );
      if (!parsed.success) {
        return parsed.response;
      }

      let tracker: IndividualTrackersRow;
      try {
        tracker = await individualTrackerService.setLiveTracker(auth.session.userId, parsed.data.trackerId);
      } catch (error) {
        if (error instanceof TrackerNotFoundError) {
          return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
        }
        throw error;
      }

      const state = await statusTrackerDo(env, auth.session.userId, tracker.TrackerId);

      return trackerContract.toResponse({ tracker: toTracker(tracker, state) }, { noStore: true });
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Individual tracker select active error"]]));
      return errorContract.toResponse({ error: "Failed to select active tracker" }, { status: 500, noStore: true });
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
          const state = await statusTrackerDo(env, auth.session.userId, row.TrackerId).catch(() => null);
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

      const parsedParams = parsePathParams(request.params, trackerParamsSchema, "Invalid tracker id");
      if (!parsedParams.success) {
        return parsedParams.response;
      }
      const { trackerId } = parsedParams.data;

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

  router.put("/api/individual-tracker/manage/:trackerId/matches", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, individualTrackerService, logService } = services;

    try {
      const auth = await requireSession(request, authService);
      if (!auth.ok) {
        return auth.response;
      }

      const parsedParams = parsePathParams(request.params, trackerParamsSchema, "Invalid tracker id");
      if (!parsedParams.success) {
        return parsedParams.response;
      }
      const { trackerId } = parsedParams.data;

      const parsed = await parseJsonBody(request, selectMatchesRequestSchema, "Invalid select matches request");
      if (!parsed.success) {
        return parsed.response;
      }

      let tracker: IndividualTrackersRow;
      try {
        tracker = await individualTrackerService.getOwnedTracker(auth.session.userId, trackerId);
        await syncMatchesDo(env, auth.session.userId, tracker.TrackerId, parsed.data.matchIds);
      } catch (error) {
        if (error instanceof TrackerNotFoundError) {
          return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
        }
        throw error;
      }

      return selectMatchesContract.toResponse({ success: true }, { noStore: true });
    } catch (error) {
      logService.error(error as Error, new Map([["message", "Individual tracker select matches error"]]));
      return errorContract.toResponse({ error: "Failed to update match selection" }, { status: 500, noStore: true });
    }
  });

};
