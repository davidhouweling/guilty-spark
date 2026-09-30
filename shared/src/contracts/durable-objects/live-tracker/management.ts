import { z } from "zod";
import { defineContract } from "../../base";
import { liveTrackerStateSchema } from "./lifecycle";

export const liveTrackerMapSchema = z.object({
  mode: z.enum(["Slayer", "Capture the Flag", "Strongholds", "Oddball", "King of the Hill", "Neutral Bomb"]),
  map: z.string().min(1),
});
export type LiveTrackerMap = z.infer<typeof liveTrackerMapSchema>;

export const liveTrackerMapsRequestSchema = z.object({
  maps: z.array(liveTrackerMapSchema).min(1).max(13),
  token: z.uuid(),
});
export type LiveTrackerMapsRequest = z.infer<typeof liveTrackerMapsRequestSchema>;

export const liveTrackerMapsClearRequestSchema = z.object({
  token: z.uuid(),
  markClearedByUser: z.boolean().optional(),
});
export type LiveTrackerMapsClearRequest = z.infer<typeof liveTrackerMapsClearRequestSchema>;

export const liveTrackerMapsClearContract = defineContract(
  z.object({ success: z.literal(true), cleared: z.boolean() }),
);

export const liveTrackerMapsUpdateContract = defineContract(
  z.object({
    success: z.literal(true),
    wasClearedByUser: z.boolean(),
  }),
);
export type LiveTrackerMapsUpdateResponse = z.infer<typeof liveTrackerMapsUpdateContract.schema>;

export const liveTrackerMapsContract = defineContract(
  z.object({
    maps: z.array(liveTrackerMapSchema),
  }),
);
export type LiveTrackerMapsResponse = z.infer<typeof liveTrackerMapsContract.schema>;

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
