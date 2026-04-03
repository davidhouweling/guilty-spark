import { sampleIndividualTrackerStateMessage } from "@guilty-spark/contracts/live-tracker/fakes/data";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { LiveTrackerMatchRenderModel } from "../../../components/live-tracker/types";
import type { MatchHistoryEntry, MatchHistoryResponse } from "../../../components/tracker-initiation/types";
import type { StartTrackerRequest, StartTrackerResponse, TrackerInitiationService } from "../types";

export interface FakeTrackerInitiationServiceOptions {
  readonly customGameIndices?: readonly number[];
}

/**
 * Fake implementation of tracker initiation service for testing and development.
 * Follows the same architectural pattern as FakeLiveTrackerService.
 */
export class FakeTrackerInitiationService implements TrackerInitiationService {
  private readonly options: FakeTrackerInitiationServiceOptions;

  public constructor(options?: FakeTrackerInitiationServiceOptions) {
    this.options = {
      customGameIndices: options?.customGameIndices ?? [1, 2],
    };
  }

  public async fetchMatchHistory(gamertag: string): Promise<MatchHistoryResponse> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Extract all matches from individual tracker groups
    const { data } = sampleIndividualTrackerStateMessage;
    if (data.type !== "individual") {
      throw new Error("Expected individual tracker state");
    }

    const allMatches: LiveTrackerMatchRenderModel[] = [];

    for (const group of data.groups) {
      switch (group.type) {
        case "neatqueue-series": {
          // Convert from LiveTrackerMatchSummary to LiveTrackerMatchRenderModel
          for (const summary of group.matchSummaries) {
            allMatches.push({
              matchId: summary.matchId,
              gameTypeAndMap: summary.gameTypeAndMap,
              gameType: summary.gameType,
              gameMap: summary.gameMap,
              gameMapThumbnailUrl: summary.gameMapThumbnailUrl,
              duration: summary.duration,
              gameScore: summary.gameScore,
              gameSubScore: summary.gameSubScore,
              startTime: summary.startTime,
              endTime: summary.endTime,
              rawMatchStats: null,
              playerXuidToGametag: summary.playerXuidToGametag,
            });
          }
          break;
        }
        case "grouped-matches": {
          for (const summary of group.matchSummaries) {
            allMatches.push({
              matchId: summary.matchId,
              gameTypeAndMap: summary.gameTypeAndMap,
              gameType: summary.gameType,
              gameMap: summary.gameMap,
              gameMapThumbnailUrl: summary.gameMapThumbnailUrl,
              duration: summary.duration,
              gameScore: summary.gameScore,
              gameSubScore: summary.gameSubScore,
              startTime: summary.startTime,
              endTime: summary.endTime,
              rawMatchStats: null,
              playerXuidToGametag: summary.playerXuidToGametag,
            });
          }
          break;
        }
        case "single-match": {
          allMatches.push({
            matchId: group.matchSummary.matchId,
            gameTypeAndMap: group.matchSummary.gameTypeAndMap,
            gameType: group.matchSummary.gameType,
            gameMap: group.matchSummary.gameMap,
            gameMapThumbnailUrl: group.matchSummary.gameMapThumbnailUrl,
            duration: group.matchSummary.duration,
            gameScore: group.matchSummary.gameScore,
            gameSubScore: group.matchSummary.gameSubScore,
            startTime: group.matchSummary.startTime,
            endTime: group.matchSummary.endTime,
            rawMatchStats: null,
            playerXuidToGametag: group.matchSummary.playerXuidToGametag,
          });
          break;
        }
        default: {
          throw new UnreachableError(group);
        }
      }
    }

    const matches = allMatches.map((match) => this.convertToMatchHistoryEntry(match));

    // Mark some as custom games (create new objects to avoid mutation)
    const modifiedMatches = matches.map((match, index) => {
      if (this.options.customGameIndices?.includes(index) === true) {
        return {
          ...match,
          isMatchmaking: false,
        };
      }
      return match;
    });

    return {
      gamertag,
      xuid: `xuid(${String(Date.now())})`,
      matches: modifiedMatches,
      suggestedGroupings: modifiedMatches.length >= 2 ? [[modifiedMatches[1].matchId, modifiedMatches[2].matchId]] : [],
    };
  }

  public async startTracker(request: StartTrackerRequest): Promise<StartTrackerResponse> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 200));

    return {
      success: true,
      websocketUrl: `/ws/tracker/individual/${request.gamertag}`,
      gamertag: request.gamertag,
    };
  }

  /**
   * Convert LiveTrackerMatchRenderModel to MatchHistoryEntry for tracker initiation
   */
  private convertToMatchHistoryEntry(match: LiveTrackerMatchRenderModel): MatchHistoryEntry {
    return {
      matchId: match.matchId,
      startTime: match.startTime,
      endTime: match.endTime,
      duration: match.duration,
      mapName: match.gameMap,
      modeName: match.gameType,
      outcome: match.gameScore.includes(":")
        ? parseInt(match.gameScore.split(":")[0]) > parseInt(match.gameScore.split(":")[1])
          ? "Win"
          : "Loss"
        : "DNF",
      resultString: match.gameSubScore != null ? `${match.gameScore} (${match.gameSubScore})` : match.gameScore,
      isMatchmaking: true, // Sample data doesn't have this field, assume true for variety
      teams: [Object.keys(match.playerXuidToGametag).slice(0, 4), Object.keys(match.playerXuidToGametag).slice(4, 8)],
      mapThumbnailUrl: match.gameMapThumbnailUrl,
    };
  }
}

/**
 * Factory function to create fake tracker initiation service with optional configuration.
 * Follows the same pattern as aFakeLiveTrackerServiceWith.
 */
export function aFakeTrackerInitiationServiceWith(
  options?: FakeTrackerInitiationServiceOptions,
): FakeTrackerInitiationService {
  return new FakeTrackerInitiationService(options);
}
