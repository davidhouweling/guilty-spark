import type { MatchHistoryResponse } from "../../components/tracker-initiation/types";

export interface StartTrackerRequest {
  readonly gamertag: string;
  readonly selectedMatchIds: readonly string[];
  readonly groupings: readonly (readonly string[])[];
}

export interface StartTrackerSuccessResponse {
  readonly success: true;
  readonly websocketUrl: string;
  readonly gamertag: string;
}

export interface StartTrackerFailureResponse {
  readonly success: false;
  readonly error: string;
}

export type StartTrackerResponse = StartTrackerSuccessResponse | StartTrackerFailureResponse;

/**
 * Service for tracker initiation API calls (match history and starting trackers)
 */
export interface TrackerInitiationService {
  /**
   * Fetch match history for a gamertag
   */
  fetchMatchHistory(gamertag: string): Promise<MatchHistoryResponse>;

  /**
   * Start a tracker with selected matches and groupings
   */
  startTracker(request: StartTrackerRequest): Promise<StartTrackerResponse>;
}
