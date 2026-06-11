import { z } from "zod";
import { defineContract } from "../base";

export const killMatrixEntrySchema = z.object({
  killed: z.string().describe("XUID of the victim"),
  perfect: z.boolean().describe("Whether this kill was a perfect medal"),
  weapon: z.string().nullable().describe("Weapon used (null if unavailable)"),
  headshot: z.boolean().nullable().describe("Whether the kill was a headshot (null if unavailable)"),
});

export type KillMatrixEntry = z.infer<typeof killMatrixEntrySchema>;

export const matchAnalyticsSchema = z.object({
  requestedModules: z.array(z.enum(["killMatrix", "scoreProgression"])),
  killMatrix: z
    .optional(
      z.record(
        z.string().describe("Killer XUID"),
        z.array(killMatrixEntrySchema)
      )
    )
    .describe("Map of killer XUID to array of kills (victim XUID, perfect status, weapon, headshot)"),
  scoreProgression: z
    .optional(
      z.object({})
    )
    .describe("Score progression timeline (Phase 2)"),
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

export const matchAnalyticsContract = defineContract(
  z.object({ analytics: matchAnalyticsSchema })
);
