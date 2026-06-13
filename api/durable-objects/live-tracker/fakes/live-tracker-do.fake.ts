import type {
  LiveTrackerStartResponse,
  LiveTrackerPauseResponse,
  LiveTrackerResumeResponse,
  LiveTrackerStopResponse,
} from "@guilty-spark/shared/contracts/durable-objects/live-tracker/lifecycle";
import type {
  LiveTrackerRefreshResponse,
  LiveTrackerSubstitutionResponse,
  LiveTrackerStatusResponse,
  LiveTrackerRepostResponse,
} from "@guilty-spark/shared/contracts/durable-objects/live-tracker/management";
import type { LiveTrackerState } from "../types";
import type { LiveTrackerDO } from "../live-tracker-do";
import { aFakeDurableObjectId } from "../../../base/fakes/do.fake";

export interface FakeLiveTrackerDOOpts {
  startResponse?: LiveTrackerStartResponse;
  pauseResponse?: LiveTrackerPauseResponse;
  resumeResponse?: LiveTrackerResumeResponse;
  stopResponse?: LiveTrackerStopResponse;
  refreshResponse?: LiveTrackerRefreshResponse;
  substitutionResponse?: LiveTrackerSubstitutionResponse;
  statusResponse?: LiveTrackerStatusResponse;
  repostResponse?: LiveTrackerRepostResponse;
  shouldThrowError?: boolean;
  errorMessage?: string;
}

export type FakeLiveTrackerDO = DurableObjectStub<LiveTrackerDO> & Rpc.DurableObjectBranded;

export function aFakeLiveTrackerStateWith(opts: Partial<LiveTrackerState> = {}): LiveTrackerState {
  return {
    userId: "fake-user-id",
    guildId: "fake-guild-id",
    channelId: "1234567890",
    queueNumber: 42,
    isPaused: false,
    status: "active",
    liveMessageId: "fake-message-id",
    startTime: new Date().toISOString(),
    lastUpdateTime: new Date().toISOString(),
    searchStartTime: new Date().toISOString(),
    checkCount: 1,
    players: {},
    teams: [],
    substitutions: [],
    discoveredMatches: {},
    matchIds: [],
    seriesScore: "🦅 0:0 🐍",
    errorState: {
      consecutiveErrors: 0,
      backoffMinutes: 3,
      lastSuccessTime: new Date().toISOString(),
    },
    lastMessageState: {
      matchCount: 0,
      substitutionCount: 0,
    },
    playersAssociationData: {},
    ...opts,
  };
}

export function aFakeLiveTrackerDOWith(opts: FakeLiveTrackerDOOpts = {}): FakeLiveTrackerDO {
  const defaultState: LiveTrackerState = aFakeLiveTrackerStateWith();

  const startResponse: LiveTrackerStartResponse = opts.startResponse ?? { success: true, state: defaultState };
  const pauseResponse: LiveTrackerPauseResponse = opts.pauseResponse ?? { success: true, state: defaultState };
  const resumeResponse: LiveTrackerResumeResponse = opts.resumeResponse ?? { success: true, state: defaultState };
  const stopResponse: LiveTrackerStopResponse = opts.stopResponse ?? { success: true, state: defaultState };
  const refreshResponse: LiveTrackerRefreshResponse = opts.refreshResponse ?? { success: true, state: defaultState };
  const substitutionResponse: LiveTrackerSubstitutionResponse = opts.substitutionResponse ?? {
    success: true,
    substitution: {
      playerOutId: "fake-player-out-id",
      playerInId: "fake-player-in-id",
      teamIndex: 0,
    },
  };
  const statusResponse: LiveTrackerStatusResponse = opts.statusResponse ?? { state: defaultState };
  const { shouldThrowError = false, errorMessage = "Fake DO error" } = opts;

  const fetchMock: FakeLiveTrackerDO["fetch"] = async (input) => {
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

    let responseBody: string | null = null;
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
      case "/refresh":
        responseBody = JSON.stringify(refreshResponse);
        break;
      case "/status":
        responseBody = JSON.stringify(statusResponse);
        break;
      case "/substitution":
        responseBody = JSON.stringify(substitutionResponse);
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
