import { z } from "zod";
import { defineContract } from "../../base";
import { liveTrackerStateSchema } from "./lifecycle";

export const liveTrackerRefreshRequestSchema = z.object({
  matchCompleted: z.boolean().optional(),
});
export type LiveTrackerRefreshRequest = z.infer<typeof liveTrackerRefreshRequestSchema>;

export const liveTrackerRefreshContract = defineContract(
  z.union([
    z.object({ success: z.literal(true), state: liveTrackerStateSchema }),
    z.object({ success: z.literal(false), error: z.literal("cooldown"), message: z.string() }),
    z.object({ success: z.literal(false), state: liveTrackerStateSchema }),
  ]),
);
export type LiveTrackerRefreshResponse = z.infer<typeof liveTrackerRefreshContract.schema>;

export const liveTrackerSubstitutionRequestSchema = z.object({
  playerOutId: z.string(),
  playerInId: z.string(),
  playerAssociationData: z.record(z.string(), z.unknown()),
});
export type LiveTrackerSubstitutionRequest = z.infer<typeof liveTrackerSubstitutionRequestSchema>;

export const liveTrackerSubstitutionContract = defineContract(
  z.object({
    success: z.literal(true),
    substitution: z.object({
      playerOutId: z.string(),
      playerInId: z.string(),
      teamIndex: z.number(),
    }),
  }),
);
export type LiveTrackerSubstitutionResponse = z.infer<typeof liveTrackerSubstitutionContract.schema>;

export const liveTrackerStatusContract = defineContract(z.object({ state: liveTrackerStateSchema }));
export type LiveTrackerStatusResponse = z.infer<typeof liveTrackerStatusContract.schema>;

export const liveTrackerRepostRequestSchema = z.object({
  newMessageId: z.string(),
});
export type LiveTrackerRepostRequest = z.infer<typeof liveTrackerRepostRequestSchema>;

export const liveTrackerRepostContract = defineContract(
  z.object({
    success: z.literal(true),
    oldMessageId: z.string(),
    newMessageId: z.string(),
  }),
);
export type LiveTrackerRepostResponse = z.infer<typeof liveTrackerRepostContract.schema>;
