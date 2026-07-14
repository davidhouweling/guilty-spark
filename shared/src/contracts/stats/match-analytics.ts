import { z } from "zod";

const killRaceEventSchema = z.object({
  timestampMs: z.number().int().nonnegative(),
  teamId: z.number().int().nonnegative(),
  runningScores: z.record(z.string(), z.number().int().nonnegative()),
});

const killRaceTimelineSchema = z.object({
  type: z.literal("kill-race"),
  events: z.array(killRaceEventSchema),
});

export const killMatrixEntrySchema = z.object({
  count: z.number().int().nonnegative().describe("Total kills for this killer/victim pair"),
  headshotKills: z.number().int().nonnegative().describe("Headshot kill count for this killer/victim pair"),
  perfects: z.number().int().nonnegative().describe("Perfect medal kill count for this killer/victim pair"),
  weapons: z.array(
    z.object({
      weaponId: z.number().int().nonnegative(),
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
      timeline: killRaceTimelineSchema,
    })
    .nullable(),
});

export type MatchAnalytics = z.infer<typeof matchAnalyticsSchema>;
