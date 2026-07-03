import { z } from "zod";
import { defineContract } from "../../base";

export const trackerChangedPayloadSchema = z.object({
  userId: z.string(),
  trackerId: z.string(),
  lastUpdateTime: z.string(),
});
export type TrackerChangedPayload = z.infer<typeof trackerChangedPayloadSchema>;

export const userTrackerNudgeContract = defineContract(z.object({ success: z.literal(true) }));
export type UserTrackerNudgeResponse = z.infer<typeof userTrackerNudgeContract.schema>;
