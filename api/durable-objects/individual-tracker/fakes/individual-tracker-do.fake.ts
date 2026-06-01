import type {
  IndividualTrackerPauseResponse,
  IndividualTrackerResumeResponse,
  IndividualTrackerStartResponse,
  IndividualTrackerInternalState,
  IndividualTrackerState,
  IndividualTrackerStatusResponse,
  IndividualTrackerStopResponse,
} from "../types";
import type { IndividualTrackerDO } from "../individual-tracker-do";
import { aFakeDurableObjectId } from "../../../base/fakes/do.fake";

export interface FakeIndividualTrackerDOOpts {
  startResponse?: IndividualTrackerStartResponse;
  pauseResponse?: IndividualTrackerPauseResponse;
  resumeResponse?: IndividualTrackerResumeResponse;
  stopResponse?: IndividualTrackerStopResponse;
  statusResponse?: IndividualTrackerStatusResponse;
  shouldThrowError?: boolean;
  errorMessage?: string;
}

export type FakeIndividualTrackerDO = DurableObjectStub<IndividualTrackerDO> & Rpc.DurableObjectBranded;

export function aFakeIndividualTrackerInternalStateWith(
  opts: Partial<IndividualTrackerInternalState> = {},
): IndividualTrackerInternalState {
  return {
    userId: "fake-user-id",
    trackerId: "fake-tracker-id",
    xuid: "fake-xuid",
    gamertag: "FakeGamertag",
    status: "active",
    isPaused: false,
    startTime: new Date().toISOString(),
    lastUpdateTime: new Date().toISOString(),
    searchStartTime: new Date().toISOString(),
    lastMatchDiscoveredAt: undefined,
    checkCount: 0,
    matchIds: [],
    discoveredMatches: {},
    idleTimeoutHours: 6,
    errorState: {
      consecutiveErrors: 0,
      backoffMinutes: 3,
      lastSuccessTime: new Date().toISOString(),
    },
    ...opts,
  };
}

export function aFakeIndividualTrackerStateWith(opts: Partial<IndividualTrackerState> = {}): IndividualTrackerState {
  return {
    userId: "fake-user-id",
    trackerId: "fake-tracker-id",
    xuid: "fake-xuid",
    gamertag: "FakeGamertag",
    status: "active",
    isPaused: false,
    startTime: new Date().toISOString(),
    lastUpdateTime: new Date().toISOString(),
    idleTimeoutHours: 6,
    ...opts,
  };
}

export function aFakeIndividualTrackerDOWith(opts: FakeIndividualTrackerDOOpts = {}): FakeIndividualTrackerDO {
  const defaultState = aFakeIndividualTrackerStateWith();

  const startResponse: IndividualTrackerStartResponse = opts.startResponse ?? { success: true, state: defaultState };
  const pauseResponse: IndividualTrackerPauseResponse = opts.pauseResponse ?? { success: true, state: defaultState };
  const resumeResponse: IndividualTrackerResumeResponse = opts.resumeResponse ?? { success: true, state: defaultState };
  const stopResponse: IndividualTrackerStopResponse = opts.stopResponse ?? { success: true };
  const statusResponse: IndividualTrackerStatusResponse = opts.statusResponse ?? { state: defaultState };
  const { shouldThrowError = false, errorMessage = "Fake DO error" } = opts;

  const fetchMock: FakeIndividualTrackerDO["fetch"] = async (input) => {
    if (shouldThrowError) {
      throw new Error(errorMessage);
    }

    let urlString: string;
    if (typeof input === "string") {
      urlString = input;
    } else if (input instanceof URL) {
      urlString = input.href;
    } else {
      urlString = input.url;
    }

    const urlObj = new URL(urlString);
    const path = urlObj.pathname;

    let responseBody: string;
    switch (path) {
      case "/start":
        responseBody = JSON.stringify(startResponse);
        break;
      case "/pause":
        responseBody = JSON.stringify(pauseResponse);
        break;
      case "/resume":
        responseBody = JSON.stringify(resumeResponse);
        break;
      case "/stop":
        responseBody = JSON.stringify(stopResponse);
        break;
      case "/status":
        responseBody = JSON.stringify(statusResponse);
        break;
      default:
        responseBody = JSON.stringify({ success: false, error: `Unknown endpoint: ${path}` });
        break;
    }

    return Promise.resolve(
      new Response(responseBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

  return {
    ["__DURABLE_OBJECT_BRAND"]: undefined as never,
    fetch: fetchMock,
    connect: (): Socket => {
      throw new Error("Socket connections not supported in fake");
    },
    id: aFakeDurableObjectId(),
  };
}
