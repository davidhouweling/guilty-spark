import { z } from "zod";

export const userTrackerStateSchema = z.object({
  userId: z.string(),
  lastUpdateTime: z.string(),
});
export type UserTrackerState = z.infer<typeof userTrackerStateSchema>;
