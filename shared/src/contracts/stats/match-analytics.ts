import { z } from "zod";
import { defineContract } from "../base";

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

export const SUPPORTED_ANALYTICS_MODULES = ["killMatrix"] as const;
export const analyticsModuleSchema = z.enum(SUPPORTED_ANALYTICS_MODULES);
export type AnalyticsModule = z.infer<typeof analyticsModuleSchema>;

export const matchAnalyticsParamsSchema = z.object({
  matchId: z.string(),
});
export type MatchAnalyticsParams = z.infer<typeof matchAnalyticsParamsSchema>;

const requestedModulesQuerySchema = z
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

export const matchAnalyticsQuerySchema = z.object({
  modules: requestedModulesQuerySchema,
});
export type MatchAnalyticsQuery = z.infer<typeof matchAnalyticsQuerySchema>;

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
});

export type MatchAnalytics = z.infer<typeof matchAnalyticsSchema>;

export const matchAnalyticsContract = defineContract(z.object({ analytics: matchAnalyticsSchema }));
