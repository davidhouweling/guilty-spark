import { z } from "zod";
import { defineContract } from "../../base";
import { trackerStateSchema } from "../../individual-tracker/tracker";
import { trackerSeriesTeamSchema } from "../../individual-tracker/view";

// hasActiveSeries is optional here because old persisted DO state may predate the field.
// trackerStateSchema marks it required (suitable for fresh API responses).
export const individualTrackerStateSchema = trackerStateSchema.extend({
  hasActiveSeries: z.boolean().optional(),
});
export type IndividualTrackerDoState = z.infer<typeof individualTrackerStateSchema>;

export const individualTrackerSeriesSeedSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  guildIconUrl: z.string().nullable(),
  startedAt: z.string(),
  searchStartTime: z.string().optional(),
  teams: z.array(trackerSeriesTeamSchema),
  matchIds: z.array(z.string()),
});
export type IndividualTrackerSeriesSeed = z.infer<typeof individualTrackerSeriesSeedSchema>;

export const individualTrackerStartRequestSchema = z.object({
  userId: z.string(),
  trackerId: z.string(),
  xuid: z.string(),
  gamertag: z.string(),
  searchStartTime: z.string(),
  idleTimeoutHours: z.number(),
  seriesSeed: individualTrackerSeriesSeedSchema.optional(),
  // "series" trackers have no personal gamertag/xuid (both are "") and never poll Halo -- see
  // sourceGuildId/sourceQueueNumber, which identify the NeatQueue queue they track instead.
  trackerKind: z.enum(["personal", "series"]).default("personal"),
  sourceGuildId: z.string().optional(),
  sourceQueueNumber: z.number().optional(),
});
export type IndividualTrackerStartRequest = z.infer<typeof individualTrackerStartRequestSchema>;

export const individualTrackerStartContract = defineContract(
  z.object({ success: z.literal(true), state: individualTrackerStateSchema }),
);
export type IndividualTrackerStartResponse = z.infer<typeof individualTrackerStartContract.schema>;

export const individualTrackerPauseContract = defineContract(
  z.object({ success: z.literal(true), state: individualTrackerStateSchema }),
);
export type IndividualTrackerPauseResponse = z.infer<typeof individualTrackerPauseContract.schema>;

export const individualTrackerResumeContract = defineContract(
  z.object({ success: z.literal(true), state: individualTrackerStateSchema }),
);
export type IndividualTrackerResumeResponse = z.infer<typeof individualTrackerResumeContract.schema>;

export const individualTrackerStopContract = defineContract(z.object({ success: z.literal(true) }));
export type IndividualTrackerStopResponse = z.infer<typeof individualTrackerStopContract.schema>;
