import { z } from "zod";
import { defineContract } from "../../base";

export const seriesPlayerSchema = z.object({
  discordId: z.string().nullable(),
  discordName: z.string().nullable(),
  gamertag: z.string(),
  xboxId: z.string().nullable(),
});
export type SeriesPlayer = z.infer<typeof seriesPlayerSchema>;

export const seriesTeamSchema = z.object({
  id: z.number(),
  name: z.string(),
  players: z.array(seriesPlayerSchema),
});
export type SeriesTeam = z.infer<typeof seriesTeamSchema>;

// Payload for series start event
export const seriesStartedPayloadSchema = z.object({
  type: z.literal("started"),
  title: z.string(),
  subtitle: z.string(),
  teams: z.array(seriesTeamSchema),
  guildIconUrl: z.string().nullable().optional(),
});
export type SeriesStartedPayload = z.infer<typeof seriesStartedPayloadSchema>;

// Payload for series end event
export const seriesEndedPayloadSchema = z.object({
  type: z.literal("ended"),
});
export type SeriesEndedPayload = z.infer<typeof seriesEndedPayloadSchema>;

// Payload for substitution event
export const seriesSubstitutedPayloadSchema = z.object({
  type: z.literal("substituted"),
  teamId: z.number(),
  playerOut: seriesPlayerSchema,
  playerIn: seriesPlayerSchema,
});
export type SeriesSubstitutedPayload = z.infer<typeof seriesSubstitutedPayloadSchema>;

// Union of all three event types
export const seriesNotifyRequestSchema = z.union([
  seriesStartedPayloadSchema,
  seriesEndedPayloadSchema,
  seriesSubstitutedPayloadSchema,
]);
export type SeriesNotifyRequest = z.infer<typeof seriesNotifyRequestSchema>;

export const seriesNotifyContract = defineContract(z.object({ success: z.literal(true) }));
export type SeriesNotifyResponse = z.infer<typeof seriesNotifyContract.schema>;
