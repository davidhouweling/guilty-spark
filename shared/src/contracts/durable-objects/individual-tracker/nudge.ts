import { z } from "zod";
import { defineContract } from "../../base";
import { trackerSeriesTeamSchema } from "../../individual-tracker/view";

export const seriesContextPayloadSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  guildIconUrl: z.string().nullable(),
  teams: z.array(trackerSeriesTeamSchema),
});
export type SeriesContextPayload = z.infer<typeof seriesContextPayloadSchema>;
export const seriesContextNullablePayloadSchema = z.union([seriesContextPayloadSchema, z.null()]);
export type SeriesContextNullablePayload = z.infer<typeof seriesContextNullablePayloadSchema>;

export const individualTrackerNudgeContract = defineContract(z.object({ success: z.literal(true) }));
export type IndividualTrackerNudgeResponse = z.infer<typeof individualTrackerNudgeContract.schema>;
