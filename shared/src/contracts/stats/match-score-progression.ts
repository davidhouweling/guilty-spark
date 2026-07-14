import { z } from "zod";

export const killRaceEventSchema = z.object({
  timestampMs: z.number().int().nonnegative(),
  teamId: z.number().int().nonnegative(),
  runningScores: z.record(z.string(), z.number().int().nonnegative()),
});

export type KillRaceEvent = z.infer<typeof killRaceEventSchema>;

export const killRaceTimelineSchema = z.object({
  type: z.literal("kill-race"),
  events: z.array(killRaceEventSchema),
});

export type KillRaceTimeline = z.infer<typeof killRaceTimelineSchema>;
