import { z } from "zod";

export const liveTrackerMapSchema = z.object({
  mode: z.enum(["Slayer", "Capture the Flag", "Strongholds", "Oddball", "King of the Hill", "Neutral Bomb"]),
  map: z.string().min(1),
});
export type LiveTrackerMap = z.infer<typeof liveTrackerMapSchema>;
