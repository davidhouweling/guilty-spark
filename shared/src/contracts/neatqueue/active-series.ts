import { z } from "zod";
import { defineContract } from "../base";

// Intentionally omits discordId/discordName: this list is visible to any signed-in user
// across every guild, and a gamertag/xboxId is reasonably public while a Discord ID is not.
export const activeSeriesPlayerSchema = z.object({
  gamertag: z.string().nullable(),
  xboxId: z.string().nullable(),
});
export type ActiveSeriesPlayer = z.infer<typeof activeSeriesPlayerSchema>;

export const activeSeriesTeamSchema = z.object({
  id: z.number().int().min(0),
  name: z.string(),
  players: z.array(activeSeriesPlayerSchema),
});
export type ActiveSeriesTeam = z.infer<typeof activeSeriesTeamSchema>;

export const activeSeriesSummarySchema = z.object({
  guildId: z.string(),
  queueNumber: z.number().int().min(0),
  title: z.string(),
  subtitle: z.string(),
  guildIconUrl: z.string().nullable(),
  startedAt: z.string().optional(),
  teams: z.array(activeSeriesTeamSchema),
});
export type ActiveSeriesSummary = z.infer<typeof activeSeriesSummarySchema>;

export const activeSeriesListSchema = z.object({
  series: z.array(activeSeriesSummarySchema),
});
export type ActiveSeriesList = z.infer<typeof activeSeriesListSchema>;

export const activeSeriesListContract = defineContract(activeSeriesListSchema);
export type ActiveSeriesListResponse = z.infer<typeof activeSeriesListContract.schema>;
