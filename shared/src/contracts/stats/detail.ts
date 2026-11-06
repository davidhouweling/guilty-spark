import { compareAsc } from "date-fns";
import { z } from "zod";
import { defineContract } from "../base";
import { liveTrackerMapSchema } from "../durable-objects/live-tracker/maps";
import { trackerMatchOutcomeSchema } from "../individual-tracker/view";
import {
  condensedMedalSchema,
  condensedPlayerSchema,
  condensedStatSchema,
  condensedTeamMappingSchema,
  condensedTeamSchema,
} from "./detail-primitives";

const matchIdSchema = z.string().trim().min(1).max(128);
const matchIdsSchema = z.array(matchIdSchema).min(1).max(30);
const countSchema = z.number().int().nonnegative();
const totalsSchema = z.object({
  stats: z.array(condensedStatSchema),
  medals: z.array(condensedMedalSchema),
});

// CoreStats.Score is not a formatted score string; Oddball uses RoundsWon as primary.
export const matchScoreSectionSchema = z.object({
  metric: z.enum(["score", "rounds-won"]),
  teams: z.array(condensedTeamMappingSchema.extend({ value: z.number() })),
});

export const condensedMatchDetailSchema = z
  .object({
    matchId: matchIdSchema,
    startTime: z.iso.datetime(),
    endTime: z.iso.datetime(),
    durationSeconds: z.number().nonnegative(),
    map: z.object({
      assetId: z.string().min(1),
      versionId: z.string().min(1),
      name: z.string().nullable(),
      thumbnailUrl: z.url().nullable(),
    }),
    mode: z.object({
      assetId: z.string().min(1),
      versionId: z.string().min(1),
      gameVariantCategory: z.number().int(),
      name: z.string().nullable(),
    }),
    isMatchmaking: z.boolean(),
    matchmakingPlaylist: z.string().nullable(),
    teamsEnabled: z.boolean(),
    teamScoringEnabled: z.boolean(),
    teamCount: countSchema,
    score: z.object({
      primary: matchScoreSectionSchema.nullable(),
      secondary: matchScoreSectionSchema.nullable(),
    }),
    plannedMapIndex: countSchema.optional(),
    teams: z.array(condensedTeamSchema),
    players: z.array(condensedPlayerSchema),
  })
  .refine((match) => compareAsc(match.endTime, match.startTime) >= 0, { message: "End precedes start" })
  .refine((match) => match.teamCount === match.teams.length, { message: "Team count does not match teams" });
export type CondensedMatchDetail = z.infer<typeof condensedMatchDetailSchema>;

export const matchDetailResultSchema = z
  .discriminatedUnion("status", [
    z.object({
      status: z.literal("resolved"),
      matchId: matchIdSchema,
      detail: condensedMatchDetailSchema,
    }),
    z.object({
      status: z.literal("unavailable"),
      matchId: matchIdSchema,
      reason: z.enum(["not-found", "forbidden", "fetch-failed"]),
    }),
  ])
  .refine((result) => result.status !== "resolved" || result.matchId === result.detail.matchId, {
    message: "Resolved match identity does not match requested identity",
  });
export type MatchDetailResult = z.infer<typeof matchDetailResultSchema>;

export const matchDetailQuerySchema = z.object({
  matchIds: z
    .string()
    .transform((raw) => raw.split(","))
    .pipe(matchIdsSchema),
});
export type MatchDetailQuery = z.infer<typeof matchDetailQuerySchema>;

// One result per requested ID, including failures and duplicates, in request order.
export const matchDetailBatchSchema = z
  .object({
    matchIds: matchIdsSchema,
    results: z.array(matchDetailResultSchema).min(1).max(30),
  })
  .refine(
    (batch) =>
      batch.matchIds.length === batch.results.length &&
      batch.matchIds.every((matchId, index) => matchId === batch.results[index]?.matchId),
    { message: "Results must cover requested IDs in order" },
  );
export const matchDetailContract = defineContract(matchDetailBatchSchema);
export type MatchDetailResponse = z.infer<typeof matchDetailBatchSchema>;

const seriesPlayerTeamTotalsSchema = totalsSchema.extend({
  seriesTeamId: z.number().int(),
  gamesPlayed: countSchema,
});
export const condensedSeriesPlayerSchema = condensedPlayerSchema
  .pick({ playerId: true, xuid: true, discordUserId: true, gamertag: true, playerType: true })
  .extend({
    gamesPlayed: countSchema,
    stats: z.array(condensedStatSchema),
    medals: z.array(condensedMedalSchema),
    teamStats: z.array(seriesPlayerTeamTotalsSchema),
  });
export type CondensedSeriesPlayer = z.infer<typeof condensedSeriesPlayerSchema>;

export const condensedSeriesTeamSchema = totalsSchema.extend({
  seriesTeamId: z.number().int(),
  name: z.string().nullable(),
  outcome: trackerMatchOutcomeSchema,
  gamesPlayed: countSchema,
  gamesWon: countSchema,
  playerIds: z.array(z.string().min(1)),
});
export type CondensedSeriesTeam = z.infer<typeof condensedSeriesTeamSchema>;

// Totals are backend products, never derived from whichever match details loaded successfully.
export const seriesAggregationSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("resolved"),
    gamesPlayed: countSchema,
    completedGameCount: countSchema.describe("Backend-collapsed completed games, accounting for resumed/split games"),
    teams: z.array(condensedSeriesTeamSchema),
    players: z.array(condensedSeriesPlayerSchema),
  }),
  z.object({
    status: z.literal("unavailable"),
    reason: z.enum(["incomplete-matches", "ambiguous-team-mapping", "aggregation-failed"]),
  }),
]);
export type SeriesAggregation = z.infer<typeof seriesAggregationSchema>;

export const seriesDetailSchema = z.object({
  seriesId: z.string().min(1),
  matches: matchDetailBatchSchema,
  aggregation: seriesAggregationSchema,
  context: z
    .object({
      title: z.string(),
      subtitle: z.string().nullable(),
      guildIconUrl: z.url().nullable().optional(),
      startedAt: z.iso.datetime().optional(),
      plannedMaps: z.array(liveTrackerMapSchema).optional(),
    })
    .optional(),
});
export const seriesDetailContract = defineContract(seriesDetailSchema);
export type SeriesDetailResponse = z.infer<typeof seriesDetailSchema>;
