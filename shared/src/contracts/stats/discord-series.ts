import { z } from "zod";
import { defineContract } from "../base";

export const discordSeriesStatsParamsSchema = z.object({
  guildId: z.string().regex(/^\d+$/, "Invalid guildId"),
  queueNumber: z
    .string()
    .regex(/^[1-9]\d*$/, "Invalid queueNumber")
    .transform((value) => Number(value))
    .refine((value) => Number.isSafeInteger(value) && value <= Number.MAX_SAFE_INTEGER, {
      message: "Invalid queueNumber",
    }),
});
export type DiscordSeriesStatsParams = z.infer<typeof discordSeriesStatsParamsSchema>;

export const discordSeriesStatsResolvedSchema = z.object({
  status: z.literal("resolved"),
  guildId: z.string(),
  queueNumber: z.number().int().positive(),
  matchIds: z.array(z.string()).min(1),
  renderData: z.object({
    title: z.string(),
    subtitle: z.string(),
    seriesScore: z.string(),
    teams: z.array(
      z.object({
        name: z.string(),
        players: z.array(z.string()),
      }),
    ),
    matches: z
      .array(
        z.object({
          matchId: z.string(),
          gameTypeAndMap: z.string(),
          gameType: z.string(),
          gameMap: z.string(),
          gameMapThumbnailUrl: z.string(),
          duration: z.string(),
          gameScore: z.string(),
          gameSubScore: z.string().nullable(),
          startTime: z.string(),
          endTime: z.string(),
          playerXuidToGametag: z.record(z.string(), z.string()),
          rawMatch: z.unknown(),
        }),
      )
      .min(1),
  }),
});
export type DiscordSeriesStatsResolved = z.infer<typeof discordSeriesStatsResolvedSchema>;

export const discordSeriesStatsPendingSchema = z.object({
  status: z.literal("pending-index"),
  guildId: z.string(),
  queueNumber: z.number().int().positive(),
  retryAfterSeconds: z.number().positive(),
});
export type DiscordSeriesStatsPending = z.infer<typeof discordSeriesStatsPendingSchema>;

export const discordSeriesStatsNotFoundSchema = z.object({
  status: z.literal("not-found"),
  guildId: z.string(),
  queueNumber: z.number().int().positive(),
  reason: z.string(),
});
export type DiscordSeriesStatsNotFound = z.infer<typeof discordSeriesStatsNotFoundSchema>;

export const discordSeriesStatsForbiddenSchema = z.object({
  status: z.literal("forbidden"),
  guildId: z.string(),
  queueNumber: z.number().int().positive(),
  reason: z.string(),
});
export type DiscordSeriesStatsForbidden = z.infer<typeof discordSeriesStatsForbiddenSchema>;

export const discordSeriesStatsSchema = z.discriminatedUnion("status", [
  discordSeriesStatsResolvedSchema,
  discordSeriesStatsPendingSchema,
  discordSeriesStatsNotFoundSchema,
  discordSeriesStatsForbiddenSchema,
]);
export type DiscordSeriesStats = z.infer<typeof discordSeriesStatsSchema>;

export const discordSeriesStatsContract = defineContract(discordSeriesStatsSchema);
export type DiscordSeriesStatsResponse = z.infer<typeof discordSeriesStatsContract.schema>;
