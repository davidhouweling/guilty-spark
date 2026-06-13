import { z } from "zod";
import { defineContract } from "../../base";

const liveTrackerStatusSchema = z.enum(["active", "paused", "stopped"]);

export const teamMappingSchema = z.object({
  name: z.string(),
  playerIds: z.array(z.string()),
});

export const substitutionSchema = z.object({
  playerOutId: z.string(),
  playerInId: z.string(),
  teamIndex: z.number(),
  teamName: z.string(),
  timestamp: z.string(),
});

const errorStateSchema = z.object({
  consecutiveErrors: z.number(),
  backoffMinutes: z.number(),
  lastSuccessTime: z.string(),
  lastErrorMessage: z.string().optional(),
});

export const liveTrackerStateSchema = z.object({
  userId: z.string(),
  guildId: z.string(),
  channelId: z.string(),
  queueNumber: z.number(),
  isPaused: z.boolean(),
  status: liveTrackerStatusSchema,
  liveMessageId: z.string().optional(),
  startTime: z.string(),
  lastUpdateTime: z.string(),
  searchStartTime: z.string(),
  checkCount: z.number(),
  players: z.record(z.string(), z.unknown()),
  playersAssociationData: z.record(z.string(), z.unknown()),
  teams: z.array(teamMappingSchema),
  substitutions: z.array(substitutionSchema),
  errorState: errorStateSchema,
  discoveredMatches: z.record(z.string(), z.unknown()),
  matchIds: z.array(z.string()),
  seriesScore: z.string(),
  lastMessageState: z.object({
    matchCount: z.number(),
    substitutionCount: z.number(),
  }),
  channelManagePermissionCache: z.boolean().optional(),
  lastRefreshAttempt: z.string().optional(),
  refreshInProgress: z.boolean().optional(),
  refreshStartedAt: z.string().optional(),
});
export type LiveTrackerDoState = z.infer<typeof liveTrackerStateSchema>;

const matchSummarySchema = z.object({
  matchId: z.string(),
  gameTypeAndMap: z.string(),
  gameType: z.string(),
  gameMap: z.string(),
  gameMapThumbnailUrl: z.string(),
  duration: z.string(),
  gameScore: z.string(),
  gameSubScore: z.string().nullable(),
  startTime: z.string(),
  endTime: z.string(),
  playerXuidToGametag: z.record(z.string(), z.string()),
});

const seriesDataSchema = z.object({
  seriesId: z.object({
    guildId: z.string(),
    queueNumber: z.number(),
  }),
  teams: z.array(
    z.object({
      name: z.string(),
      playerIds: z.array(z.string()),
    }),
  ),
  seriesScore: z.string(),
  matchIds: z.array(z.string()),
  startTime: z.string(),
  lastUpdateTime: z.string(),
});

export const liveTrackerEmbedDataSchema = z.object({
  userId: z.string(),
  guildId: z.string(),
  channelId: z.string(),
  queueNumber: z.number(),
  trackerLabel: z.string().optional(),
  status: liveTrackerStatusSchema,
  isPaused: z.boolean(),
  lastUpdated: z.union([z.date(), z.string()]).optional(),
  nextCheck: z.union([z.date(), z.string()]).optional(),
  enrichedMatches: z.array(matchSummarySchema).optional(),
  seriesScore: z.string().optional(),
  substitutions: z.array(substitutionSchema).optional(),
  errorState: errorStateSchema.optional(),
  seriesData: seriesDataSchema.optional(),
});
export type LiveTrackerEmbedData = z.infer<typeof liveTrackerEmbedDataSchema>;

export const liveTrackerStartRequestSchema = z.object({
  userId: z.string(),
  guildId: z.string(),
  channelId: z.string(),
  queueNumber: z.number(),
  interactionToken: z.string().optional(),
  liveMessageId: z.string().optional(),
  players: z.record(z.string(), z.unknown()),
  teams: z.array(teamMappingSchema),
  queueStartTime: z.string(),
  playersAssociationData: z.record(z.string(), z.unknown()),
});
export type LiveTrackerStartRequest = z.infer<typeof liveTrackerStartRequestSchema>;

export const liveTrackerStartContract = defineContract(
  z.object({
    success: z.boolean(),
    state: liveTrackerStateSchema,
  }),
);
export type LiveTrackerStartResponse = z.infer<typeof liveTrackerStartContract.schema>;

export const liveTrackerPauseContract = defineContract(
  z.object({
    success: z.literal(true),
    state: liveTrackerStateSchema,
    embedData: liveTrackerEmbedDataSchema.optional(),
  }),
);
export type LiveTrackerPauseResponse = z.infer<typeof liveTrackerPauseContract.schema>;

export const liveTrackerResumeContract = defineContract(
  z.object({
    success: z.literal(true),
    state: liveTrackerStateSchema,
    embedData: liveTrackerEmbedDataSchema.optional(),
  }),
);
export type LiveTrackerResumeResponse = z.infer<typeof liveTrackerResumeContract.schema>;

export const liveTrackerStopContract = defineContract(
  z.object({
    success: z.literal(true),
    state: liveTrackerStateSchema,
    embedData: liveTrackerEmbedDataSchema.optional(),
  }),
);
export type LiveTrackerStopResponse = z.infer<typeof liveTrackerStopContract.schema>;
