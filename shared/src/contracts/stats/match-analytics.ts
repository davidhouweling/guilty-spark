import { z } from "zod";

const progressionEventSchema = z.object({
  timestampMs: z.number().int().nonnegative(),
  teamId: z.number().int().nonnegative(),
  runningScores: z.record(z.string().regex(/^\d+$/), z.number().int().nonnegative()),
});

const killRaceEventSchema = progressionEventSchema;

const killRaceDeathEventSchema = z.object({
  timestampMs: z.number().int().nonnegative(),
  teamId: z.number().int().nonnegative(),
});

export type KillRaceEvent = z.infer<typeof killRaceEventSchema>;
export type KillRaceDeathEvent = z.infer<typeof killRaceDeathEventSchema>;

const killRaceTimelineSchema = z.object({
  type: z.literal("kill-race"),
  events: z.array(killRaceEventSchema),
  deathTimeline: z.array(killRaceDeathEventSchema),
  respawnDurationMs: z.number().int().positive().nullable(),
});

const kothEventSchema = progressionEventSchema;

const kothControlPeriodSchema = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  controllingTeamId: z.number().int().nonnegative().nullable(),
});

const kothTimelineSchema = z.object({
  type: z.literal("koth"),
  events: z.array(kothEventSchema),
  controlPeriods: z.array(kothControlPeriodSchema),
  hillCaptureTimestamps: z.array(z.number().int().nonnegative()),
});

export type KothEvent = z.infer<typeof kothEventSchema>;
export type KothControlPeriod = z.infer<typeof kothControlPeriodSchema>;
export type KothTimeline = z.infer<typeof kothTimelineSchema>;

export const killMatrixEntrySchema = z.object({
  count: z.number().int().nonnegative().describe("Total kills for this killer/victim pair"),
  perfects: z.number().int().nonnegative().describe("Perfect medal kill count for this killer/victim pair"),
});

export type KillMatrixEntry = z.infer<typeof killMatrixEntrySchema>;

export const SUPPORTED_ANALYTICS_MODULES = ["killMatrix", "scoreProgression"] as const;
export const analyticsModuleSchema = z.enum(SUPPORTED_ANALYTICS_MODULES);
export type AnalyticsModule = z.infer<typeof analyticsModuleSchema>;

export const requestedModulesQuerySchema = z
  .string()
  .optional()
  .default("killMatrix")
  .transform((modulesRaw) => {
    return Array.from(
      new Set(
        modulesRaw
          .split(",")
          .map((module) => module.trim())
          .filter((module) => module.length > 0),
      ),
    );
  })
  .pipe(z.array(analyticsModuleSchema).min(1));

export const matchAnalyticsSchema = z.object({
  requestedModules: z.array(analyticsModuleSchema).min(1),
  killMatrix: z
    .record(
      z.string().regex(/^\d+:\d+$/, "Invalid killMatrix key format, expected <killerXuid>:<victimXuid>"),
      killMatrixEntrySchema,
    )
    .describe("Flat kill matrix keyed by <killerXuid>:<victimXuid>"),
  scoreProgression: z
    .object({
      mode: z.number().int().nonnegative(),
      durationMs: z.number().int().nonnegative(),
      teamCount: z.number().int().positive(),
      timeline: z.discriminatedUnion("type", [killRaceTimelineSchema, kothTimelineSchema]),
    })
    .nullable(),
});

export type MatchAnalytics = z.infer<typeof matchAnalyticsSchema>;
