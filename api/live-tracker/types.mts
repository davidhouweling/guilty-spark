import type { LiveTrackerMatchSummary, LiveTrackerStatus } from "@guilty-spark/contracts/live-tracker/types";

export interface LiveTrackerEmbedData {
  userId: string;
  guildId: string;
  channelId: string;
  queueNumber: number;
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
}
