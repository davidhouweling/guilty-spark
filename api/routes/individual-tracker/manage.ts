import { errorContract } from "@guilty-spark/shared/contracts/error";
import {
  deleteTrackerContract,
  editSeriesContract,
  editSeriesRequestSchema,
  endSeriesContract,
  refreshTrackerContract,
  resumeSeriesContract,
  selectMatchesContract,
  selectMatchesRequestSchema,
  selectActiveTrackerRequestSchema,
  startSeriesContract,
  startSeriesRequestSchema,
  startTrackerRequestSchema,
  stopTrackerContract,
  trackerContract,
  trackerParamsSchema,
  trackersContract,
  type StartSeriesRequest,
  type EditSeriesRequest,
  type SelectMatchesRequest,
} from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import {
  individualTrackerPauseContract,
  individualTrackerResumeContract,
  individualTrackerStartContract,
  individualTrackerStopContract,
  type IndividualTrackerDoState,
  type IndividualTrackerStartRequest,
} from "@guilty-spark/shared/contracts/durable-objects/individual-tracker/lifecycle";
import { individualTrackerStatusContract } from "@guilty-spark/shared/contracts/durable-objects/individual-tracker/management";
import { parseJsonBody, parsePathParams } from "@guilty-spark/shared/base/request-parsing";
import type { IndividualTrackersRow } from "../../services/database/types/individual_trackers";
import {
  ActiveSeriesExistsError,
  NoActiveSeriesError,
  NoCompletedSeriesError,
  TrackerLimitReachedError,
  TrackerNotFoundError,
} from "../../services/individual-tracker/errors";
import type { CreateTrackerOptions } from "../../services/individual-tracker/types";
import type { RoutesRegisterHandler } from "../base/types";
import { requireSession } from "../base/require-session";
import { toTracker } from "./mapper";

const DEFAULT_IDLE_TIMEOUT_HOURS = 6;

class SyncMatchesError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SyncMatchesError";
  }
}

class RefreshTrackerConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RefreshTrackerConflictError";
  }
}

function trackerDoStub(env: Env, userId: string, trackerId: string): DurableObjectStub {
  const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${userId}:${trackerId}`);
  return env.INDIVIDUAL_TRACKER_DO.get(doId);
}

function assertDoOk(response: Response): void {
  if (!response.ok) {
    throw new Error(`DO request failed with status ${response.status.toString()}`);
  }
}

async function startTrackerDo(
  env: Env,
  startRequest: IndividualTrackerStartRequest,
): Promise<IndividualTrackerDoState> {
  const stub = trackerDoStub(env, startRequest.userId, startRequest.trackerId);
  const response = await stub.fetch("http://do/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(startRequest),
  });
  assertDoOk(response);
  const result = await individualTrackerStartContract.fromResponse(response);
  return result.state;
}

async function pauseTrackerDo(env: Env, userId: string, trackerId: string): Promise<IndividualTrackerDoState> {
  const stub = trackerDoStub(env, userId, trackerId);
  const response = await stub.fetch("http://do/pause", { method: "POST" });
  assertDoOk(response);
  const result = await individualTrackerPauseContract.fromResponse(response);
  return result.state;
}

async function resumeTrackerDo(env: Env, userId: string, trackerId: string): Promise<IndividualTrackerDoState> {
  const stub = trackerDoStub(env, userId, trackerId);
  const response = await stub.fetch("http://do/resume", { method: "POST" });
  assertDoOk(response);
  const result = await individualTrackerResumeContract.fromResponse(response);
  return result.state;
}

async function stopTrackerDo(env: Env, userId: string, trackerId: string): Promise<void> {
  const stub = trackerDoStub(env, userId, trackerId);
  const response = await stub.fetch("http://do/stop", { method: "POST" });
  assertDoOk(response);
  await individualTrackerStopContract.fromResponse(response);
}

async function statusTrackerDo(env: Env, userId: string, trackerId: string): Promise<IndividualTrackerDoState | null> {
  const stub = trackerDoStub(env, userId, trackerId);
  const response = await stub.fetch("http://do/status", { method: "GET" });
  assertDoOk(response);
  const result = await individualTrackerStatusContract.fromResponse(response);
  return result.state;
}

function assertDoOkWith404(response: Response): void {
  if (response.status === 404) {
    throw new TrackerNotFoundError();
  }
  assertDoOk(response);
}

async function syncMatchesDo(env: Env, userId: string, trackerId: string, body: SelectMatchesRequest): Promise<void> {
  const stub = trackerDoStub(env, userId, trackerId);
  const response = await stub.fetch("http://do/select-matches", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 400) {
    const responseBody = await response
      .clone()
      .json()
      .catch(() => null);
    if (responseBody != null) {
      const payload = errorContract.safeParse(responseBody);
      if (payload.success) {
        throw new SyncMatchesError(payload.data.error);
      }
    }

    throw new SyncMatchesError("Failed to update match selection");
  }
  assertDoOkWith404(response);
  await selectMatchesContract.fromResponse(response);
}

async function startSeriesDo(env: Env, userId: string, trackerId: string, body: StartSeriesRequest): Promise<void> {
  const stub = trackerDoStub(env, userId, trackerId);
  const response = await stub.fetch("http://do/start-series", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assertDoOkWith404(response);
  await startSeriesContract.fromResponse(response);
}

async function endSeriesDo(env: Env, userId: string, trackerId: string): Promise<void> {
  const stub = trackerDoStub(env, userId, trackerId);
  const response = await stub.fetch("http://do/end-series", { method: "POST" });
  if (response.status === 409) {
    throw new NoActiveSeriesError();
  }
  assertDoOkWith404(response);
  await endSeriesContract.fromResponse(response);
}

async function editSeriesDo(env: Env, userId: string, trackerId: string, body: EditSeriesRequest): Promise<void> {
  const stub = trackerDoStub(env, userId, trackerId);
  const response = await stub.fetch("http://do/edit-series", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 409) {
    throw new NoActiveSeriesError();
  }
  assertDoOkWith404(response);
  await editSeriesContract.fromResponse(response);
}

async function resumeSeriesDo(env: Env, userId: string, trackerId: string): Promise<void> {
  const stub = trackerDoStub(env, userId, trackerId);
  const response = await stub.fetch("http://do/resume-series", { method: "POST" });
  if (response.status === 409) {
    throw new ActiveSeriesExistsError();
  }
  if (response.status === 422) {
    throw new NoCompletedSeriesError();
  }
  assertDoOkWith404(response);
  await resumeSeriesContract.fromResponse(response);
}

async function refreshTrackerDo(env: Env, userId: string, trackerId: string): Promise<void> {
  const stub = trackerDoStub(env, userId, trackerId);
  const response = await stub.fetch("http://do/refresh", { method: "POST" });
  if (response.status === 409) {
    const responseBody = await response
      .clone()
      .json()
      .catch(() => null);
    if (responseBody != null) {
      const payload = errorContract.safeParse(responseBody);
      if (payload.success) {
        throw new RefreshTrackerConflictError(payload.data.error);
      }
    }

    throw new RefreshTrackerConflictError("Tracker cannot be refreshed right now");
  }
  assertDoOkWith404(response);
  await refreshTrackerContract.fromResponse(response);
}

export const trackerManageRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  router.post("/api/individual-tracker/manage/start", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, individualTrackerService, logService } = services;

    try {
      const auth = await requireSession(request, authService);
      if (!auth.ok) {
        return auth.response;
      }

      const parsed = await parseJsonBody(request, startTrackerRequestSchema, "Invalid start tracker request");
      if (!parsed.success) {
        return parsed.response;
      }

      const createOptions: CreateTrackerOptions = {
        userId: auth.session.userId,
        gamertag: parsed.data.gamertag,
        xuid: parsed.data.xuid,
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

      logService.info(
        "Individual tracker started",
        new Map([
          ["trackerId", tracker.TrackerId],
          ["gamertag", tracker.Gamertag],
          ["userId", auth.session.userId],
        ]),
      );

      return trackerContract.toResponse({ tracker: toTracker(tracker, state) }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Individual tracker start error"]]));
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

      logService.info("Individual tracker stopped", new Map([["trackerId", tracker.TrackerId]]));

      return stopTrackerContract.toResponse({ success: true }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Individual tracker stop error"]]));
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

      logService.info("Individual tracker paused", new Map([["trackerId", tracker.TrackerId]]));

      return trackerContract.toResponse({ tracker: toTracker(paused, state) }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Individual tracker pause error"]]));
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

      logService.info("Individual tracker resumed", new Map([["trackerId", tracker.TrackerId]]));

      return trackerContract.toResponse({ tracker: toTracker(resumed, state) }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Individual tracker resume error"]]));
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
      logService.error(error, new Map([["context", "Individual tracker select active error"]]));
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
      logService.error(error, new Map([["context", "Individual tracker list error"]]));
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
      logService.error(error, new Map([["context", "Individual tracker status error"]]));
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
        await syncMatchesDo(env, auth.session.userId, tracker.TrackerId, {
          matchIds: [...parsed.data.matchIds],
          seriesGroups: parsed.data.seriesGroups.map((group) => ({
            matchIds: [...group.matchIds],
            titleOverride: group.titleOverride,
            subtitleOverride: group.subtitleOverride,
          })),
        });
      } catch (error) {
        if (error instanceof TrackerNotFoundError) {
          return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
        }
        if (error instanceof SyncMatchesError) {
          return errorContract.toResponse({ error: error.message }, { status: 400, noStore: true });
        }
        throw error;
      }

      return selectMatchesContract.toResponse({ success: true }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Individual tracker select matches error"]]));
      return errorContract.toResponse({ error: "Failed to update match selection" }, { status: 500, noStore: true });
    }
  });

  router.post("/api/individual-tracker/:trackerId/start-series", async (request, env: Env) => {
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

      const parsed = await parseJsonBody(request, startSeriesRequestSchema, "Invalid start series request");
      if (!parsed.success) {
        return parsed.response;
      }

      let tracker: IndividualTrackersRow;
      try {
        tracker = await individualTrackerService.getOwnedTracker(auth.session.userId, trackerId);
      } catch (error) {
        if (error instanceof TrackerNotFoundError) {
          return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
        }
        throw error;
      }

      await startSeriesDo(env, auth.session.userId, tracker.TrackerId, {
        titleOverride: parsed.data.titleOverride,
        subtitleOverride: parsed.data.subtitleOverride,
        teams: parsed.data.teams.map((team) => ({ name: team.name, members: Array.from(team.members) })),
        ...(parsed.data.matchIds != null && parsed.data.matchIds.length > 0
          ? { matchIds: [...parsed.data.matchIds] }
          : {}),
      });

      return startSeriesContract.toResponse({ success: true }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Individual tracker start series error"]]));
      return errorContract.toResponse({ error: "Failed to start series" }, { status: 500, noStore: true });
    }
  });

  router.post("/api/individual-tracker/:trackerId/end-series", async (request, env: Env) => {
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

      try {
        await individualTrackerService.getOwnedTracker(auth.session.userId, trackerId);
        await endSeriesDo(env, auth.session.userId, trackerId);
      } catch (error) {
        if (error instanceof TrackerNotFoundError) {
          return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
        }
        if (error instanceof NoActiveSeriesError) {
          return errorContract.toResponse({ error: "No active series" }, { status: 409, noStore: true });
        }
        throw error;
      }

      return endSeriesContract.toResponse({ success: true }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Individual tracker end series error"]]));
      return errorContract.toResponse({ error: "Failed to end series" }, { status: 500, noStore: true });
    }
  });

  router.patch("/api/individual-tracker/manage/:trackerId/series", async (request, env: Env) => {
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

      const parsed = await parseJsonBody(request, editSeriesRequestSchema, "Invalid edit series request");
      if (!parsed.success) {
        return parsed.response;
      }

      try {
        await individualTrackerService.getOwnedTracker(auth.session.userId, trackerId);
        const editBody: EditSeriesRequest = {};
        if (parsed.data.titleOverride !== undefined) {
          editBody.titleOverride = parsed.data.titleOverride;
        }
        if (parsed.data.subtitleOverride !== undefined) {
          editBody.subtitleOverride = parsed.data.subtitleOverride;
        }
        if (parsed.data.teams !== undefined) {
          editBody.teams = parsed.data.teams.map((team) => ({ name: team.name, members: Array.from(team.members) }));
        }
        await editSeriesDo(env, auth.session.userId, trackerId, editBody);
      } catch (error) {
        if (error instanceof TrackerNotFoundError) {
          return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
        }
        if (error instanceof NoActiveSeriesError) {
          return errorContract.toResponse({ error: "No active series" }, { status: 409, noStore: true });
        }
        throw error;
      }

      return editSeriesContract.toResponse({ success: true }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Individual tracker edit series error"]]));
      return errorContract.toResponse({ error: "Failed to edit series" }, { status: 500, noStore: true });
    }
  });

  router.post("/api/individual-tracker/manage/:trackerId/resume-series", async (request, env: Env) => {
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

      try {
        await individualTrackerService.getOwnedTracker(auth.session.userId, trackerId);
        await resumeSeriesDo(env, auth.session.userId, trackerId);
      } catch (error) {
        if (error instanceof TrackerNotFoundError) {
          return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
        }
        if (error instanceof ActiveSeriesExistsError) {
          return errorContract.toResponse(
            { error: "End the current series before resuming" },
            { status: 409, noStore: true },
          );
        }
        if (error instanceof NoCompletedSeriesError) {
          return errorContract.toResponse({ error: "No completed series to resume" }, { status: 409, noStore: true });
        }
        throw error;
      }

      return resumeSeriesContract.toResponse({ success: true }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Individual tracker resume series error"]]));
      return errorContract.toResponse({ error: "Failed to resume series" }, { status: 500, noStore: true });
    }
  });

  router.post("/api/individual-tracker/manage/:trackerId/refresh", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, individualTrackerService, logService } = services;

    try {
      const auth = await requireSession(request, authService);
      if (!auth.ok) {
        return auth.response;
      }

      const pathParams = parsePathParams(request.params, trackerParamsSchema, "Invalid tracker id");
      if (!pathParams.success) {
        return pathParams.response;
      }

      await individualTrackerService.getOwnedTracker(auth.session.userId, pathParams.data.trackerId);
      await refreshTrackerDo(env, auth.session.userId, pathParams.data.trackerId);

      return refreshTrackerContract.toResponse({ success: true }, { noStore: true });
    } catch (error) {
      if (error instanceof TrackerNotFoundError) {
        return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
      }
      if (error instanceof RefreshTrackerConflictError) {
        return errorContract.toResponse({ error: error.message }, { status: 409, noStore: true });
      }

      logService.error(error, new Map([["context", "Individual tracker refresh error"]]));
      return errorContract.toResponse({ error: "Failed to refresh tracker" }, { status: 500, noStore: true });
    }
  });

  router.delete("/api/individual-tracker/:trackerId", async (request, env: Env) => {
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

      try {
        await individualTrackerService.getOwnedTracker(auth.session.userId, trackerId);
        await stopTrackerDo(env, auth.session.userId, trackerId);
        await individualTrackerService.deleteTracker(trackerId);
      } catch (error) {
        if (error instanceof TrackerNotFoundError) {
          return errorContract.toResponse({ error: "Tracker not found" }, { status: 404, noStore: true });
        }
        throw error;
      }

      return deleteTrackerContract.toResponse({ success: true }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Individual tracker delete error"]]));
      return errorContract.toResponse({ error: "Failed to delete tracker" }, { status: 500, noStore: true });
    }
  });
};
