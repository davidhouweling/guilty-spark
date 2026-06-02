import { z } from "zod";
import { defineContract, defineMessageContract } from "../base";
import { trackerStatusSchema } from "./tracker";

export const trackerMatchSummarySchema = z.object({
  matchId: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  mapAssetId: z.string(),
  modeAssetId: z.string(),
  outcome: z.string(),
  score: z.string(),
});
export type TrackerMatchSummary = z.infer<typeof trackerMatchSummarySchema>;

export const trackerLiveViewSchema = z.object({
  trackerId: z.string(),
  gamertag: z.string(),
  status: trackerStatusSchema,
  matches: z.array(trackerMatchSummarySchema),
  lastUpdateTime: z.string(),
  lastMatchDiscoveredAt: z.string().nullable(),
});
export type TrackerLiveView = z.infer<typeof trackerLiveViewSchema>;

export const trackerViewStateSchema = trackerLiveViewSchema.extend({ isLive: z.boolean() });
export type TrackerViewState = z.infer<typeof trackerViewStateSchema>;

export const trackerViewContract = defineContract(z.object({ view: trackerViewStateSchema }));
export type TrackerViewResponse = z.infer<typeof trackerViewContract.schema>;

export const trackerViewMessageSchema = z.object({
  type: z.literal("view"),
  view: trackerLiveViewSchema,
});
export type TrackerViewMessage = z.infer<typeof trackerViewMessageSchema>;

export const trackerViewMessageContract = defineMessageContract(trackerViewMessageSchema);
