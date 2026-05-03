import type {
  IndividualTrackerGamesAddResponse,
  IndividualTrackerGamesRemoveResponse,
  IndividualTrackerGamesSyncResponse,
  IndividualTrackerSeriesGroupUpdateResponse,
  IndividualTrackerStartResponse,
  IndividualTrackerState,
  IndividualTrackerStatusResponse,
  IndividualTrackerStopResponse,
} from "../types";
import type { IndividualTrackerDO } from "../individual-tracker-do";
import { DEFAULT_IDLE_TIMEOUT_HOURS } from "../types";

export interface FakeIndividualTrackerDOOpts {
  startResponse?: IndividualTrackerStartResponse;
  stopResponse?: IndividualTrackerStopResponse;
  statusResponse?: IndividualTrackerStatusResponse;
  gamesAddResponse?: IndividualTrackerGamesAddResponse;
  gamesRemoveResponse?: IndividualTrackerGamesRemoveResponse;
  gamesSyncResponse?: IndividualTrackerGamesSyncResponse;
  seriesGroupsUpdateResponse?: IndividualTrackerSeriesGroupUpdateResponse;
  shouldThrowError?: boolean;
  errorMessage?: string;
}

export type FakeIndividualTrackerDO = DurableObjectStub<IndividualTrackerDO> & Rpc.DurableObjectBranded;

export function aFakeIndividualTrackerStateWith(opts: Partial<IndividualTrackerState> = {}): IndividualTrackerState {
  const now = new Date().toISOString();
  return {
    userId: "fake-user-id",
    trackerId: "fake-tracker-id",
    xuid: "fake-xuid",
    gamertag: "FakeGamertag",
    teamColor: "salmon",
    enemyColor: "cerulean",
    status: "active",
    isPaused: false,
    startTime: now,
    lastUpdateTime: now,
    searchStartTime: now,
    lastMatchDiscoveredAt: now,
    checkCount: 0,
    idleTimeoutHours: DEFAULT_IDLE_TIMEOUT_HOURS,
    userMicrosoftTokens: {
      accessToken: "fake-access-token",
      refreshToken: undefined,
      expiresAt: undefined,
    },
    discoveredMatches: {},
    matchIds: [],
    matchGroupings: [],
    seriesGroups: [],
    excludedMatchIds: [],
    errorState: {
      consecutiveErrors: 0,
      backoffMinutes: 3,
      lastSuccessTime: now,
    },
    refreshInProgress: undefined,
    refreshStartedAt: undefined,
    ...opts,
  };
}

export function aFakeIndividualTrackerDOWith(opts: FakeIndividualTrackerDOOpts = {}): FakeIndividualTrackerDO {
  const defaultState = aFakeIndividualTrackerStateWith();

  const startResponse: IndividualTrackerStartResponse = opts.startResponse ?? { success: true, state: defaultState };
  const stopResponse: IndividualTrackerStopResponse = opts.stopResponse ?? {
    success: true,
    state: { ...defaultState, status: "stopped" },
  };
  const statusResponse: IndividualTrackerStatusResponse = opts.statusResponse ?? { state: defaultState };
  const gamesAddResponse: IndividualTrackerGamesAddResponse = opts.gamesAddResponse ?? {
    success: true,
    matchId: "fake-match-id",
  };
  const gamesRemoveResponse: IndividualTrackerGamesRemoveResponse = opts.gamesRemoveResponse ?? {
    success: true,
    matchId: "fake-match-id",
  };
  const gamesSyncResponse: IndividualTrackerGamesSyncResponse = opts.gamesSyncResponse ?? {
    success: true,
    state: defaultState,
  };
  const seriesGroupsUpdateResponse: IndividualTrackerSeriesGroupUpdateResponse = opts.seriesGroupsUpdateResponse ?? {
    success: true,
    state: defaultState,
  };
  const { shouldThrowError = false, errorMessage = "Fake IndividualTrackerDO error" } = opts;

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
      case "/start": {
        responseBody = JSON.stringify(startResponse);
        break;
      }
      case "/stop": {
        responseBody = JSON.stringify(stopResponse);
        break;
      }
      case "/status": {
        responseBody = JSON.stringify(statusResponse);
        break;
      }
      case "/games-add": {
        responseBody = JSON.stringify(gamesAddResponse);
        break;
      }
      case "/games-remove": {
        responseBody = JSON.stringify(gamesRemoveResponse);
        break;
      }
      case "/games-sync": {
        responseBody = JSON.stringify(gamesSyncResponse);
        break;
      }
      case "/viewer-style": {
        responseBody = JSON.stringify({ success: true, state: defaultState });
        break;
      }
      case "/series-groups-update": {
        responseBody = JSON.stringify(seriesGroupsUpdateResponse);
        break;
      }
      case "/websocket": {
        // WebSocket upgrade not supported in fake; return 404
        return Promise.resolve(new Response("WebSocket not supported in fake", { status: 404 }));
      }
      default: {
        responseBody = JSON.stringify({ success: false, error: `Unknown endpoint: ${path}` });
        break;
      }
    }

    return Promise.resolve(
      new Response(responseBody, { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  };

  return {
    fetch: fetchMock,
    __DURABLE_OBJECT_BRAND: undefined as never,
  } as FakeIndividualTrackerDO;
}
