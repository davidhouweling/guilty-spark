import { z } from "zod";
import { defineContract } from "../base";

export const trackerStatusSchema = z.enum(["active", "paused", "stopped"]);
export type TrackerStatus = z.infer<typeof trackerStatusSchema>;

export const trackerStateSchema = z.object({
  userId: z.string(),
  trackerId: z.string(),
  xuid: z.string(),
  gamertag: z.string(),
  status: trackerStatusSchema,
  isPaused: z.boolean(),
  startTime: z.string(),
  lastUpdateTime: z.string(),
  searchStartTime: z.string().optional(),
  idleTimeoutHours: z.number(),
  hasActiveSeries: z.boolean(),
});
export type TrackerState = z.infer<typeof trackerStateSchema>;

export const trackerSchema = z.object({
  trackerId: z.string(),
  gamertag: z.string(),
  xuid: z.string(),
  status: trackerStatusSchema,
  isLive: z.boolean(),
  state: trackerStateSchema.nullable(),
});
export type Tracker = z.infer<typeof trackerSchema>;

export const startTrackerRequestSchema = z.object({
  gamertag: z.string().min(1),
  xuid: z.string().min(1),
  searchStartTime: z.iso.datetime().optional(),
  idleTimeoutHours: z.number().positive().optional(),
});
export type StartTrackerRequest = z.infer<typeof startTrackerRequestSchema>;

export const selectActiveTrackerRequestSchema = z.object({
  trackerId: z.string().min(1),
});
export type SelectActiveTrackerRequest = z.infer<typeof selectActiveTrackerRequestSchema>;

export const trackerParamsSchema = z.object({
  trackerId: z.string().min(1),
});
export type TrackerParams = z.infer<typeof trackerParamsSchema>;

export const trackerContract = defineContract(z.object({ tracker: trackerSchema }));
export type TrackerResponse = z.infer<typeof trackerContract.schema>;

export const trackersContract = defineContract(z.object({ trackers: z.array(trackerSchema) }));
export type TrackersResponse = z.infer<typeof trackersContract.schema>;

export const stopTrackerContract = defineContract(z.object({ success: z.literal(true) }));
export type StopTrackerResponse = z.infer<typeof stopTrackerContract.schema>;

export const refreshTrackerContract = defineContract(z.object({ success: z.literal(true) }));
export type RefreshTrackerResponse = z.infer<typeof refreshTrackerContract.schema>;

export const selectMatchesSeriesGroupSchema = z.object({
  matchIds: z.array(z.string().min(1)).min(2),
  titleOverride: z.string().nullable(),
  subtitleOverride: z.string().nullable(),
});
export type SelectMatchesSeriesGroup = z.infer<typeof selectMatchesSeriesGroupSchema>;

export const selectMatchesRequestSchema = z.object({
  matchIds: z.array(z.string().min(1)),
  seriesGroups: z.array(selectMatchesSeriesGroupSchema).default([]),
});
export type SelectMatchesRequest = z.infer<typeof selectMatchesRequestSchema>;

export const selectMatchesContract = defineContract(z.object({ success: z.literal(true) }));
export type SelectMatchesResponse = z.infer<typeof selectMatchesContract.schema>;

export const startSeriesTeamSchema = z.object({
  name: z.string(),
  members: z.array(z.string()),
});
export type StartSeriesTeam = z.infer<typeof startSeriesTeamSchema>;

export const startSeriesRequestSchema = z.object({
  titleOverride: z.string().nullable(),
  subtitleOverride: z.string().nullable(),
  teams: z.array(startSeriesTeamSchema),
  matchIds: z.array(z.string()).optional(),
});
export type StartSeriesRequest = z.infer<typeof startSeriesRequestSchema>;

export const startSeriesContract = defineContract(z.object({ success: z.literal(true) }));
export type StartSeriesResponse = z.infer<typeof startSeriesContract.schema>;

export const endSeriesContract = defineContract(z.object({ success: z.literal(true) }));
export type EndSeriesResponse = z.infer<typeof endSeriesContract.schema>;

export const editSeriesRequestSchema = z
  .object({
    titleOverride: z.string().nullable().optional(),
    subtitleOverride: z.string().nullable().optional(),
    teams: z
      .array(
        z.object({
          name: z.string(),
          members: z.array(z.string()),
        }),
      )
      .nonempty()
      .optional(),
  })
  .refine(
    (data) => data.titleOverride !== undefined || data.subtitleOverride !== undefined || data.teams !== undefined,
    { message: "At least one field must be provided" },
  );
export type EditSeriesRequest = z.infer<typeof editSeriesRequestSchema>;

export const editSeriesContract = defineContract(z.object({ success: z.literal(true) }));
export type EditSeriesResponse = z.infer<typeof editSeriesContract.schema>;

export const resumeSeriesContract = defineContract(z.object({ success: z.literal(true) }));
export type ResumeSeriesResponse = z.infer<typeof resumeSeriesContract.schema>;

export const deleteTrackerContract = defineContract(z.object({ success: z.literal(true) }));
export type DeleteTrackerResponse = z.infer<typeof deleteTrackerContract.schema>;
