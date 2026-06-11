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

export const matchAnalyticsParamsSchema = z.object({
  matchId: z.string(),
});
export type MatchAnalyticsParams = z.infer<typeof matchAnalyticsParamsSchema>;

export const matchAnalyticsQuerySchema = z.object({
  modules: z.string().optional().default("killMatrix"),
});
export type MatchAnalyticsQuery = z.infer<typeof matchAnalyticsQuerySchema>;

export const matchAnalyticsSchema = z.object({
  requestedModules: z.array(z.enum(["killMatrix"])),
  killMatrix: z
    .optional(z.record(z.string().describe("Key format: <killerXuid>:<victimXuid>"), killMatrixEntrySchema))
    .describe("Flat kill matrix keyed by <killerXuid>:<victimXuid>"),
  metadata: z.object({
    pairingQuality: z.object({
      unpairedDeathCount: z.number(),
      maxTimeDeltaMs: z.number(),
    }),
    perfectCounts: z.object({
      total: z.number(),
      byXuid: z.record(z.string(), z.number()),
    }),
  }),
});

export type MatchAnalytics = z.infer<typeof matchAnalyticsSchema>;

export const matchAnalyticsContract = defineContract(z.object({ analytics: matchAnalyticsSchema }));
