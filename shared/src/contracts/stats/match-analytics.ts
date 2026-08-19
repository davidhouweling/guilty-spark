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
});

const objectiveControlEventSchema = progressionEventSchema;

const objectiveControlPeriodSchema = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  controllingTeamId: z.number().int().nonnegative().nullable(),
});

const objectiveControlTimelineSchema = z.object({
  type: z.literal("objective-control"),
  events: z.array(objectiveControlEventSchema),
  controlPeriods: z.array(objectiveControlPeriodSchema),
  hillCaptureTimestamps: z.array(z.number().int().nonnegative()),
});

export type ObjectiveControlEvent = z.infer<typeof objectiveControlEventSchema>;
export type ObjectiveControlPeriod = z.infer<typeof objectiveControlPeriodSchema>;
export type ObjectiveControlTimeline = z.infer<typeof objectiveControlTimelineSchema>;

export const killMatrixEntrySchema = z.object({
  count: z.number().int().nonnegative().describe("Total kills for this killer/victim pair"),
  headshotKills: z.number().int().nonnegative().describe("Headshot kill count for this killer/victim pair"),
  perfects: z.number().int().nonnegative().describe("Perfect medal kill count for this killer/victim pair"),
  weapons: z.array(
    z.object({
      weaponId: z.string().regex(/^[0-9A-F]{16}$/u),
      name: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
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
  metadata: z.object({
    pairingQuality: z.object({
      unpairedDeathCount: z.number().int().nonnegative(),
      maxTimeDeltaMs: z.number().int().nonnegative(),
    }),
    perfectCounts: z.object({
      total: z.number().int().nonnegative(),
      byXuid: z.record(z.string(), z.number().int().nonnegative()),
    }),
  }),
  scoreProgression: z
    .object({
      mode: z.number().int().nonnegative(),
      durationMs: z.number().int().nonnegative(),
      teamCount: z.number().int().positive(),
      respawnDurationMs: z.number().int().positive().nullable(),
      timeline: z.discriminatedUnion("type", [killRaceTimelineSchema, objectiveControlTimelineSchema]),
    })
    .nullable(),
});

export type MatchAnalytics = z.infer<typeof matchAnalyticsSchema>;
