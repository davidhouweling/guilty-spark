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
  idleTimeoutHours: z.number(),
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
  searchStartTime: z.iso.datetime().optional(),
  idleTimeoutHours: z.number().positive().optional(),
});
export type StartTrackerRequest = z.infer<typeof startTrackerRequestSchema>;

export const selectActiveTrackerRequestSchema = z.object({
  trackerId: z.string().min(1),
});
export type SelectActiveTrackerRequest = z.infer<typeof selectActiveTrackerRequestSchema>;

export const trackerContract = defineContract(z.object({ tracker: trackerSchema }));
export type TrackerResponse = z.infer<typeof trackerContract.schema>;

export const trackersContract = defineContract(z.object({ trackers: z.array(trackerSchema) }));
export type TrackersResponse = z.infer<typeof trackersContract.schema>;

export const stopTrackerContract = defineContract(z.object({ success: z.literal(true) }));
export type StopTrackerResponse = z.infer<typeof stopTrackerContract.schema>;
