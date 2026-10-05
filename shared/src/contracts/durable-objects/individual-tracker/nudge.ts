import { z } from "zod";
import { defineContract } from "../../base";
import { liveTrackerMapSchema } from "../live-tracker/maps";
import { trackerSeriesTeamSchema, trackerSeriesPlayerSchema } from "../../individual-tracker/view";

// Reuse player schema from view
export const seriesPlayerSchema = trackerSeriesPlayerSchema;
export type SeriesPlayer = z.infer<typeof seriesPlayerSchema>;

export const seriesTeamSchema = trackerSeriesTeamSchema;
export type SeriesTeam = z.infer<typeof seriesTeamSchema>;

export const seriesQueueIdentitySchema = z.object({
  guildId: z.string(),
  queueNumber: z.number().int(),
});
export type SeriesQueueIdentity = z.infer<typeof seriesQueueIdentitySchema>;

// Event: Series started (set new context)
export const seriesStartedPayloadSchema = z.object({
  type: z.literal("started"),
  queue: seriesQueueIdentitySchema.optional(),
  title: z.string(),
  subtitle: z.string(),
  guildIconUrl: z.string().nullable(),
  startedAt: z.string().optional(),
  searchStartTime: z.string().optional(),
  teams: z.array(seriesTeamSchema),
  plannedMaps: z.array(liveTrackerMapSchema).optional(),
});
export type SeriesStartedPayload = z.infer<typeof seriesStartedPayloadSchema>;

export const seriesMapsUpdatedPayloadSchema = z.object({
  type: z.literal("maps-updated"),
  maps: z.array(liveTrackerMapSchema),
});
export type SeriesMapsUpdatedPayload = z.infer<typeof seriesMapsUpdatedPayloadSchema>;

// Event: Series ended (clear active series)
export const seriesEndedPayloadSchema = z.object({
  type: z.literal("ended"),
  queue: seriesQueueIdentitySchema.optional(),
  matchIds: z.array(z.string()).optional(),
});
export type SeriesEndedPayload = z.infer<typeof seriesEndedPayloadSchema>;

const hasStablePlayerIdentifier = (player: SeriesPlayer): boolean =>
  player.xboxId != null || player.discordId != null || player.gamertag != null;

// Event: Player substitution (swap player in team)
export const seriesSubstitutedPayloadSchema = z
  .object({
    type: z.literal("substituted"),
    teamId: z.number().int().min(0),
    playerOut: seriesPlayerSchema,
    playerIn: seriesPlayerSchema,
  })
  .superRefine((payload, context) => {
    if (!hasStablePlayerIdentifier(payload.playerOut)) {
      context.addIssue({
        code: "custom",
        path: ["playerOut"],
        message: "playerOut must include at least one identifier (xboxId, discordId, or gamertag)",
      });
    }

    if (!hasStablePlayerIdentifier(payload.playerIn)) {
      context.addIssue({
        code: "custom",
        path: ["playerIn"],
        message: "playerIn must include at least one identifier (xboxId, discordId, or gamertag)",
      });
    }
  });
export type SeriesSubstitutedPayload = z.infer<typeof seriesSubstitutedPayloadSchema>;

// Union of all nudge payloads
export const nudgePayloadSchema = z.discriminatedUnion("type", [
  seriesStartedPayloadSchema,
  seriesEndedPayloadSchema,
  seriesSubstitutedPayloadSchema,
  seriesMapsUpdatedPayloadSchema,
]);
export type NudgePayload = z.infer<typeof nudgePayloadSchema>;

export const individualTrackerNudgeContract = defineContract(z.object({ success: z.literal(true) }));
export type IndividualTrackerNudgeResponse = z.infer<typeof individualTrackerNudgeContract.schema>;
