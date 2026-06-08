import { z } from "zod";
import { defineContract } from "../base";

export const discordSeriesStatsParamsSchema = z.object({
  guildId: z.string().min(1),
  queueNumber: z.coerce.number().int().positive(),
});
export type DiscordSeriesStatsParams = z.infer<typeof discordSeriesStatsParamsSchema>;

export const discordSeriesStatsResolvedSchema = z.object({
  status: z.literal("resolved"),
  guildId: z.string(),
  queueNumber: z.number().int().positive(),
  matchIds: z.array(z.string()).min(1),
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
