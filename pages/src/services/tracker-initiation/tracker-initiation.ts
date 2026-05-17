import type { MatchHistoryResponse } from "../../components/tracker-initiation/types";
import type { StartTrackerRequest, StartTrackerResponse, TrackerInitiationService } from "./types";

interface Config {
  readonly apiHost: string;
}

export class RealTrackerInitiationService implements TrackerInitiationService {
  private readonly config: Config;

  public constructor(config: Config) {
    this.config = config;
  }

  public async fetchMatchHistory(gamertag: string): Promise<MatchHistoryResponse> {
    const response = await fetch(
      `${this.config.apiHost}/api/tracker/individual/${encodeURIComponent(gamertag)}/matches`,
    );

    if (!response.ok) {
      const errorMessage = response.status === 404 ? "Gamertag not found" : "Failed to fetch match history";
      throw new Error(errorMessage);
    }

    return response.json<MatchHistoryResponse>();
  }

  public async startTracker(request: StartTrackerRequest): Promise<StartTrackerResponse> {
    const response = await fetch(`${this.config.apiHost}/api/tracker/individual/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        gamertag: request.gamertag,
        selectedMatchIds: request.selectedMatchIds,
        groupings: request.groupings,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: "Failed to start tracker",
      };
    }

    const result = await response.json<{ success: boolean; websocketUrl?: string; error?: string }>();

    if (result.success && result.websocketUrl != null) {
      return {
        success: true,
        websocketUrl: result.websocketUrl,
        gamertag: request.gamertag,
      };
    }

    return {
      success: false,
      error: result.error ?? "Failed to start tracker",
    };
  }
}
