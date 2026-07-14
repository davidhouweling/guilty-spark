import { z } from "zod";
import { defineContract } from "../base";

const killRaceEventSchema = z.object({
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

export const matchScoreProgressionSchema = z.object({
  matchId: z.string(),
  mode: z.number().int(),
  durationMs: z.number().int().nonnegative(),
  teamCount: z.number().int().positive(),
  targetScore: z.number().int().positive().nullable(),
  timeline: killRaceTimelineSchema,
});

export type MatchScoreProgression = z.infer<typeof matchScoreProgressionSchema>;

export const matchScoreProgressionContract = defineContract(matchScoreProgressionSchema);

export const matchScoreProgressionQuerySchema = z.object({
  matchId: z.string().min(1),
});
