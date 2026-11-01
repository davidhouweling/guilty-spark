import { z } from "zod";

export const liveTrackerMapSchema = z.object({
  mode: z.string().trim().min(1).max(100),
  map: z.string().trim().min(1).max(100),
});
export type LiveTrackerMap = z.infer<typeof liveTrackerMapSchema>;
