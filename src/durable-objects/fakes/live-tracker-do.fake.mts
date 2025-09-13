import type { MockInstance } from "vitest";
import { vi } from "vitest";
import type { LiveTrackerState } from "../live-tracker-do.mjs";

interface LiveTrackerDOResponse {
  success: boolean;
  error?: string;
}

interface LiveTrackerStatusResponse {
  state: LiveTrackerState;
}

export interface FakeLiveTrackerDOOpts {
  startResponse?: LiveTrackerDOResponse;
  pauseResponse?: LiveTrackerDOResponse;
  resumeResponse?: LiveTrackerDOResponse;
  stopResponse?: LiveTrackerDOResponse;
  refreshResponse?: LiveTrackerDOResponse;
  statusResponse?: LiveTrackerStatusResponse | null;
  shouldThrowError?: boolean;
  errorMessage?: string;
}

export interface FakeLiveTrackerDO {
  fetch: MockInstance;
}

export function aFakeDurableObjectId(value = "fake-do-id"): DurableObjectId {
  return {
    toString: () => value,
    equals: (other: DurableObjectId) => other.toString() === value,
  };
}

export function aFakeLiveTrackerDOWith(opts: FakeLiveTrackerDOOpts = {}): FakeLiveTrackerDO {
  const defaultStatusResponse: LiveTrackerStatusResponse = {
    state: {
      userId: "fake-user-id",
      guildId: "fake-guild-id",
      channelId: "1234567890",
      queueNumber: 42,
      isPaused: false,
      status: "active",
      liveMessageId: "fake-message-id",
      startTime: new Date().toISOString(),
      lastUpdateTime: new Date().toISOString(),
      queueStartTime: new Date().toISOString(),
      checkCount: 1,
      teams: [],
      substitutions: [],
      discoveredMatches: {},
      rawMatches: {},
      errorState: {
        consecutiveErrors: 0,
        backoffMinutes: 3,
        lastSuccessTime: new Date().toISOString(),
      },
      metrics: {
        totalChecks: 1,
        totalMatches: 0,
        totalErrors: 0,
      },
    },
  };

  const {
    startResponse = { success: true },
    pauseResponse = { success: true },
    resumeResponse = { success: true },
    stopResponse = { success: true },
    refreshResponse = { success: true },
    statusResponse = defaultStatusResponse,
    shouldThrowError = false,
    errorMessage = "Fake DO error",
  } = opts;

  // Create a mock fetch function that responds to different endpoints
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (shouldThrowError) {
      throw new Error(errorMessage);
    }

    const urlObj = new URL(url);
    const path = urlObj.pathname;

    let responseData: LiveTrackerDOResponse | LiveTrackerStatusResponse | null;
    switch (path) {
      case "/start":
        responseData = startResponse;
        break;
      case "/pause":
        responseData = pauseResponse;
        break;
      case "/resume":
        responseData = resumeResponse;
        break;
      case "/stop":
        responseData = stopResponse;
        break;
      case "/refresh":
        responseData = refreshResponse;
        break;
      case "/status":
        responseData = statusResponse;
        break;
      default:
        responseData = { success: false, error: `Unknown endpoint: ${path}` };
        break;
    }

    return Promise.resolve(
      new Response(JSON.stringify(responseData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  return {
    fetch: fetchMock,
  };
}

export function aFakeDurableObjectStubWith(opts: FakeLiveTrackerDOOpts = {}): DurableObjectStub {
  const fakeDO = aFakeLiveTrackerDOWith(opts);
  return {
    id: aFakeDurableObjectId(),
    fetch: fakeDO.fetch as unknown as DurableObjectStub["fetch"],
    connect: vi.fn().mockImplementation(() => {
      throw new Error("Socket connections not supported in fake");
    }) as DurableObjectStub["connect"],
  } as DurableObjectStub;
}

export function aFakeDurableObjectNamespaceWith(
  opts: {
    stubResponse?: FakeLiveTrackerDOOpts;
    idValue?: string;
  } = {},
): DurableObjectNamespace {
  const { stubResponse = {}, idValue = "fake-do-id" } = opts;

  const get = vi.fn().mockReturnValue(aFakeDurableObjectStubWith(stubResponse));
  const idFromName = vi.fn().mockReturnValue(aFakeDurableObjectId(idValue));

  return {
    get,
    idFromName,
  } as unknown as DurableObjectNamespace;
}
