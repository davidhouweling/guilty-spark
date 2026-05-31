import * as Sentry from "@sentry/cloudflare";
import { addMilliseconds } from "date-fns";
import type { LogService } from "../../services/log/types";
import { installServices as installServicesImpl } from "../../services/install";
import type {
  IndividualTrackerStartRequest,
  IndividualTrackerState,
  IndividualTrackerStateSanitized,
  IndividualTrackerStartResponse,
  IndividualTrackerPauseResponse,
  IndividualTrackerResumeResponse,
  IndividualTrackerStopResponse,
  IndividualTrackerStatusResponse,
} from "./types";

const DISPLAY_INTERVAL_MS = 3 * 60 * 1000;
const EXECUTION_BUFFER_MS = 8 * 1000;
const ALARM_INTERVAL_MS = DISPLAY_INTERVAL_MS - EXECUTION_BUFFER_MS;

const NORMAL_INTERVAL_MINUTES = 3;

const STATE_STORAGE_KEY = "individualTrackerState";

export class IndividualTrackerDO implements DurableObject, Rpc.DurableObjectBranded {
  __DURABLE_OBJECT_BRAND = undefined as never;
  private readonly state: DurableObjectState;
  private readonly logService: LogService;

  constructor(state: DurableObjectState, env: Env, installServices = installServicesImpl) {
    this.state = state;

    const services = installServices({ env });
    this.logService = services.logService;
  }

  async fetch(request: Request): Promise<Response> {
    return await Sentry.withScope(async () => {
      const url = new URL(request.url);
      const action = url.pathname.split("/").pop();

      Sentry.setTag("durableObject", "IndividualTrackerDO");
      Sentry.setTag("action", action ?? "unknown");
      Sentry.setContext("request", {
        url: request.url,
        method: request.method,
      });

      try {
        switch (action) {
          case "start": {
            return await this.handleStart(request);
          }
          case "pause": {
            return await this.handlePause();
          }
          case "resume": {
            return await this.handleResume();
          }
          case "stop": {
            return await this.handleStop();
          }
          case "status": {
            return await this.handleStatus();
          }
          case undefined: {
            return new Response("Bad Request", { status: 400 });
          }
          default: {
            return new Response("Not Found", { status: 404 });
          }
        }
      } catch (error) {
        this.logService.error("IndividualTrackerDO fetch error:", new Map([["error", String(error)]]));
        Sentry.captureException(error);
        return new Response("Internal Server Error", { status: 500 });
      }
    });
  }

  async alarm(): Promise<void> {
    await Sentry.withScope(async () => {
      Sentry.setTag("durableObject", "IndividualTrackerDO");
      Sentry.setTag("method", "alarm");

      const trackerState = await this.getState();
      if (trackerState == null || trackerState.isPaused || trackerState.status !== "active") {
        return;
      }

      trackerState.lastUpdateTime = new Date().toISOString();
      trackerState.checkCount += 1;
      await this.setState(trackerState);

      await this.state.storage.setAlarm(addMilliseconds(new Date(), ALARM_INTERVAL_MS).getTime());
    });
  }

  private async handleStart(request: Request): Promise<Response> {
    const body = await request.json<IndividualTrackerStartRequest>();
    const now = new Date().toISOString();

    const trackerState: IndividualTrackerState = {
      userId: body.userId,
      trackerId: body.trackerId,
      xuid: body.xuid,
      gamertag: body.gamertag,
      status: "active",
      isPaused: false,
      startTime: now,
      lastUpdateTime: now,
      searchStartTime: body.searchStartTime,
      lastMatchDiscoveredAt: undefined,
      checkCount: 0,
      idleTimeoutHours: body.idleTimeoutHours,
      errorState: {
        consecutiveErrors: 0,
        backoffMinutes: NORMAL_INTERVAL_MINUTES,
        lastSuccessTime: now,
        lastErrorMessage: undefined,
      },
    };

    await this.setState(trackerState);
    await this.state.storage.setAlarm(addMilliseconds(new Date(), ALARM_INTERVAL_MS).getTime());

    const response: IndividualTrackerStartResponse = { success: true, state: this.sanitizeState(trackerState) };
    return Response.json(response);
  }

  private async handlePause(): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    trackerState.isPaused = true;
    trackerState.status = "paused";
    trackerState.lastUpdateTime = new Date().toISOString();
    await this.state.storage.deleteAlarm();
    await this.setState(trackerState);

    const response: IndividualTrackerPauseResponse = { success: true, state: this.sanitizeState(trackerState) };
    return Response.json(response);
  }

  private async handleResume(): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    trackerState.isPaused = false;
    trackerState.status = "active";
    trackerState.lastUpdateTime = new Date().toISOString();
    await this.setState(trackerState);
    await this.state.storage.setAlarm(addMilliseconds(new Date(), ALARM_INTERVAL_MS).getTime());

    const response: IndividualTrackerResumeResponse = { success: true, state: this.sanitizeState(trackerState) };
    return Response.json(response);
  }

  private async handleStop(): Promise<Response> {
    await this.state.storage.deleteAlarm();
    await this.state.storage.delete(STATE_STORAGE_KEY);

    const response: IndividualTrackerStopResponse = { success: true };
    return Response.json(response);
  }

  private async handleStatus(): Promise<Response> {
    const trackerState = await this.getState();
    const response: IndividualTrackerStatusResponse = {
      state: trackerState == null ? null : this.sanitizeState(trackerState),
    };
    return Response.json(response);
  }

  private async getState(): Promise<IndividualTrackerState | null> {
    const state = await this.state.storage.get<IndividualTrackerState>(STATE_STORAGE_KEY);
    return state ?? null;
  }

  private async setState(state: IndividualTrackerState): Promise<void> {
    await this.state.storage.put(STATE_STORAGE_KEY, state);
  }

  private sanitizeState(state: IndividualTrackerState): IndividualTrackerStateSanitized {
    return {
      userId: state.userId,
      trackerId: state.trackerId,
      xuid: state.xuid,
      gamertag: state.gamertag,
      status: state.status,
      isPaused: state.isPaused,
      startTime: state.startTime,
      lastUpdateTime: state.lastUpdateTime,
      idleTimeoutHours: state.idleTimeoutHours,
    };
  }
}
