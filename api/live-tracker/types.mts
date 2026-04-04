import type { LiveTrackerMatchSummary, LiveTrackerStatus } from "@guilty-spark/shared/live-tracker/types";

export interface LiveTrackerEmbedData {
  userId: string;
  guildId: string;
  channelId: string;
  queueNumber: number;
  trackerLabel?: string;
  status: LiveTrackerStatus;
  isPaused: boolean;
  lastUpdated: Date | string | undefined;
  nextCheck: Date | string | undefined;
  enrichedMatches: LiveTrackerMatchSummary[] | undefined;
  seriesScore: string | undefined;
  substitutions?:
    | {
        playerOutId: string;
        playerInId: string;
        teamIndex: number;
        teamName: string;
        timestamp: string;
      }[]
    | undefined;
  errorState:
    | {
        consecutiveErrors: number;
        backoffMinutes: number;
        lastSuccessTime: string;
        lastErrorMessage?: string | undefined;
      }
    | undefined;
  seriesData?:
    | {
        seriesId: {
          guildId: string;
          queueNumber: number;
        };
        teams: readonly {
          name: string;
          playerIds: readonly string[];
        }[];
        seriesScore: string;
        matchIds: readonly string[];
        startTime: string;
        lastUpdateTime: string;
      }
    | undefined;
}
