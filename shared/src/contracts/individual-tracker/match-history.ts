import { z } from "zod";
import { defineContract } from "../base";
import { trackerMatchOutcomeSchema } from "./view";

const numericSummarySchema = z.object({
  kills: z.number(),
  deaths: z.number(),
  assists: z.number(),
  damageDealt: z.number(),
  damageTaken: z.number(),
});

const highlightContributionSchema = numericSummarySchema.extend({
  headshotKills: z.number(),
  shotsFired: z.number(),
  shotsHit: z.number(),
  totalLifeSeconds: z.number(),
  totalSpawns: z.number(),
  totalLifeSpawns: z.number(),
});

// Dates, duration and score numbers are formatted in the browser's locale and time zone.
export const condensedMatchHistoryEntrySchema = z.object({
  matchId: z.string(),
  startTimeIso: z.string(),
  endTimeIso: z.string(),
  durationIso: z.string(),
  mapAssetId: z.string(),
  mapVersionId: z.string(),
  modeAssetId: z.string(),
  modeVersionId: z.string(),
  gameVariantCategory: z.number(),
  mapName: z.string(),
  modeName: z.string(),
  mapThumbnailUrl: z.string(),
  outcome: trackerMatchOutcomeSchema,
  isMatchmaking: z.boolean(),
  matchmakingPlaylist: z.string().nullable(),
  category: z.enum(["matchmaking", "custom", "local", "unknown"]),
  teams: z.array(z.array(z.string())),
  teamRosterSignature: z.string().nullable(),
  teamCount: z.number().int().nonnegative().nullable(),
  score: z.object({ scores: z.array(z.number()), roundsWon: z.array(z.number()).nullable() }).nullable(),
  trackedPlayerSummary: numericSummarySchema.nullable(),
  highlightContribution: highlightContributionSchema.nullable(),
});
export type CondensedMatchHistoryEntry = z.infer<typeof condensedMatchHistoryEntrySchema>;

export const condensedMatchHistoryPageContract = defineContract(
  z.object({
    matches: z.array(condensedMatchHistoryEntrySchema),
    suggestedGroupings: z.array(z.array(z.string())),
  }),
);
export type CondensedMatchHistoryPage = z.infer<typeof condensedMatchHistoryPageContract.schema>;
