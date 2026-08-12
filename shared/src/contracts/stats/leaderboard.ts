import { z } from "zod";
import { defineContract } from "../base";
import { LeaderboardMetric, LeaderboardWindow } from "../../halo/leaderboard";

const positiveIntString = z
  .string()
  .regex(/^\d+$/)
  .transform((raw) => Number(raw))
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));

const nonNegativeIntString = z
  .string()
  .regex(/^\d+$/)
  .transform((raw) => Number(raw))
  .pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER));

export const leaderboardQuerySchema = z.object({
  guildId: z.string().min(1),
  queueChannelId: z.string().min(1).optional(),
  window: z.enum(LeaderboardWindow).optional(),
  metric: z.enum(LeaderboardMetric).optional(),
  page: positiveIntString.optional(),
  pageSize: positiveIntString.pipe(z.number().int().max(100)).optional(),
  minGamesPlayed: nonNegativeIntString.optional(),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

export const leaderboardContract = defineContract(
  z.object({
    guildId: z.string(),
    queueChannelId: z.string().nullable(),
    window: z.enum(LeaderboardWindow),
    metric: z.enum(LeaderboardMetric),
    minGamesPlayed: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    rows: z.array(
      z.object({
        rank: z.number().int().positive(),
        xboxXuid: z.string(),
        discordUserId: z.string().nullable(),
        gamertag: z.string(),
        seriesPlayed: z.number().int().nonnegative(),
        seriesWins: z.number().int().nonnegative(),
        gamesPlayed: z.number().int().nonnegative(),
        metricValue: z.number(),
      }),
    ),
  }),
);

export type LeaderboardResponse = z.infer<typeof leaderboardContract.schema>;
