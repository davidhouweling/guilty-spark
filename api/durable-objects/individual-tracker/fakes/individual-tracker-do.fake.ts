import type {
  IndividualTrackerPauseResponse,
  IndividualTrackerResumeResponse,
  IndividualTrackerStartResponse,
  IndividualTrackerInternalState,
  IndividualTrackerMatchSummary,
  IndividualTrackerState,
  IndividualTrackerStatusResponse,
  IndividualTrackerStopResponse,
  IndividualTrackerViewState,
  IndividualTrackerViewStateResponse,
  IndividualTrackerSelectMatchesResponse,
  IndividualTrackerRefreshResponse,
  IndividualTrackerStartSeriesResponse,
  IndividualTrackerNudgeResponse,
  IndividualTrackerEditSeriesResponse,
  IndividualTrackerResumeSeriesResponse,
} from "../types";
import type { IndividualTrackerDO } from "../individual-tracker-do";
import { aFakeDurableObjectId } from "../../../base/fakes/do.fake";

export interface FakeIndividualTrackerDOOpts {
  startResponse?: IndividualTrackerStartResponse;
  pauseResponse?: IndividualTrackerPauseResponse;
  resumeResponse?: IndividualTrackerResumeResponse;
  stopResponse?: IndividualTrackerStopResponse;
  statusResponse?: IndividualTrackerStatusResponse;
  viewStateResponse?: IndividualTrackerViewStateResponse;
  selectMatchesResponse?: IndividualTrackerSelectMatchesResponse;
  refreshResponse?: IndividualTrackerRefreshResponse;
  startSeriesResponse?: IndividualTrackerStartSeriesResponse;
  endSeriesResponse?: { success: true };
  editSeriesResponse?: IndividualTrackerEditSeriesResponse;
  resumeSeriesResponse?: IndividualTrackerResumeSeriesResponse;
  nudgeResponse?: IndividualTrackerNudgeResponse;
  shouldThrowError?: boolean;
  errorMessage?: string;
}

export type FakeIndividualTrackerDO = DurableObjectStub<IndividualTrackerDO> & Rpc.DurableObjectBranded;

export function aFakeIndividualTrackerMatchSummaryWith(
  opts: Partial<IndividualTrackerMatchSummary> = {},
): IndividualTrackerMatchSummary {
  return {
    matchId: "fake-match-id",
    startTime: "2024-11-26T11:00:00.000Z",
    endTime: "2024-11-26T11:10:00.000Z",
    mapAssetId: "fake-map-asset",
    mapVersionId: "fake-map-version",
    mapName: "Fake Map",
    modeAssetId: "fake-mode-asset",
    gameVariantCategory: 6,
    outcome: "Win",
    score: "50:42",
    isMatchmaking: false,
    teamRosterSignature: null,
    teamOutcomes: null,
    ...opts,
  };
}

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
    selectedMatchIds: [],
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
    hasActiveSeries: false,
    ...opts,
  };
}

export function aFakeIndividualTrackerViewStateWith(
  opts: Partial<IndividualTrackerViewState> = {},
): IndividualTrackerViewState {
  return {
    trackerId: "fake-tracker-id",
    gamertag: "FakeGamertag",
    status: "active",
    matches: [],
    series: [],
    lastUpdateTime: new Date().toISOString(),
    lastMatchDiscoveredAt: null,
    hasActiveSeries: false,
    hasRecentCompletedSeries: false,
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
  const viewStateResponse: IndividualTrackerViewStateResponse = opts.viewStateResponse ?? {
    state: aFakeIndividualTrackerViewStateWith(),
  };
  const selectMatchesResponse: IndividualTrackerSelectMatchesResponse = opts.selectMatchesResponse ?? { success: true };
  const refreshResponse: IndividualTrackerRefreshResponse = opts.refreshResponse ?? { success: true };
  const startSeriesResponse: IndividualTrackerStartSeriesResponse = opts.startSeriesResponse ?? { success: true };
  const endSeriesResponse: { success: true } = opts.endSeriesResponse ?? { success: true };
  const editSeriesResponse: IndividualTrackerEditSeriesResponse = opts.editSeriesResponse ?? { success: true };
  const resumeSeriesResponse: IndividualTrackerResumeSeriesResponse = opts.resumeSeriesResponse ?? { success: true };
  const nudgeResponse: IndividualTrackerNudgeResponse = opts.nudgeResponse ?? { success: true };
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
      case "/view-state":
        responseBody = JSON.stringify(viewStateResponse);
        break;
      case "/select-matches":
        responseBody = JSON.stringify(selectMatchesResponse);
        break;
      case "/refresh":
        responseBody = JSON.stringify(refreshResponse);
        break;
      case "/start-series":
        responseBody = JSON.stringify(startSeriesResponse);
        break;
      case "/end-series":
        responseBody = JSON.stringify(endSeriesResponse);
        break;
      case "/edit-series":
        responseBody = JSON.stringify(editSeriesResponse);
        break;
      case "/resume-series":
        responseBody = JSON.stringify(resumeSeriesResponse);
        break;
      case "/nudge":
        responseBody = JSON.stringify(nudgeResponse);
        break;
      case "/websocket":
        return Promise.resolve(new Response(null, { status: 200, headers: { "x-fake-upgrade": "websocket" } }));
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
