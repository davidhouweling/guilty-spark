import { z } from "zod";
import { defineContract } from "../../base";
import { trackerSeriesTeamSchema, trackerSeriesPlayerSchema } from "../../individual-tracker/view";

// Reuse player schema from view
export const seriesPlayerSchema = trackerSeriesPlayerSchema;
export type SeriesPlayer = z.infer<typeof seriesPlayerSchema>;

export const seriesTeamSchema = trackerSeriesTeamSchema;
export type SeriesTeam = z.infer<typeof seriesTeamSchema>;

// Event: Series started (set new context)
export const seriesStartedPayloadSchema = z.object({
  type: z.literal("started").optional(),
  title: z.string(),
  subtitle: z.string(),
  guildIconUrl: z.string().nullable(),
  teams: z.array(seriesTeamSchema),
});
export type SeriesStartedPayload = z.infer<typeof seriesStartedPayloadSchema>;

// Event: Series ended (clear active series)
export const seriesEndedPayloadSchema = z.object({
  type: z.literal("ended"),
});
export type SeriesEndedPayload = z.infer<typeof seriesEndedPayloadSchema>;

// Event: Player substitution (swap player in team)
export const seriesSubstitutedPayloadSchema = z.object({
  type: z.literal("substituted"),
  teamId: z.number(),
  playerOut: seriesPlayerSchema,
  playerIn: seriesPlayerSchema,
});
export type SeriesSubstitutedPayload = z.infer<typeof seriesSubstitutedPayloadSchema>;

// Union of all nudge payloads (backward compat: SeriesStartedPayload can omit type)
export const nudgePayloadSchema = z.union([
  seriesStartedPayloadSchema,
  seriesEndedPayloadSchema,
  seriesSubstitutedPayloadSchema,
  z.null(),
]);
export type NudgePayload = z.infer<typeof nudgePayloadSchema>;

// Legacy aliases for backward compat
export const seriesContextPayloadSchema = seriesStartedPayloadSchema;
export type SeriesContextPayload = SeriesStartedPayload;
export const seriesContextNullablePayloadSchema = z.union([seriesContextPayloadSchema, z.null()]);
export type SeriesContextNullablePayload = z.infer<typeof seriesContextNullablePayloadSchema>;

export const individualTrackerNudgeContract = defineContract(z.object({ success: z.literal(true) }));
export type IndividualTrackerNudgeResponse = z.infer<typeof individualTrackerNudgeContract.schema>;
