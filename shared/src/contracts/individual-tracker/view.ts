import { z } from "zod";
import { streamerViewSettingsSchema } from "../../individual-tracker/streamer-view-settings";
import { defineContract, defineMessageContract } from "../base";
import { trackerStatusSchema } from "./tracker";

export const trackerMatchSummarySchema = z.object({
  matchId: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  mapAssetId: z.string(),
  mapVersionId: z.string(),
  mapName: z.string(),
  modeAssetId: z.string(),
  gameVariantCategory: z.number(),
  outcome: z.string(),
  score: z.string(),
});
export type TrackerMatchSummary = z.infer<typeof trackerMatchSummarySchema>;

export const trackerSeriesPlayerSchema = z.object({
  discordId: z.string().nullable(),
  discordName: z.string().nullable(),
  gamertag: z.string().nullable(),
  xboxId: z.string().nullable(),
});
export type TrackerSeriesPlayer = z.infer<typeof trackerSeriesPlayerSchema>;

export const trackerSeriesTeamSchema = z.object({
  name: z.string(),
  players: z.array(trackerSeriesPlayerSchema),
});
export type TrackerSeriesTeam = z.infer<typeof trackerSeriesTeamSchema>;

export const trackerSeriesGroupSchema = z.object({
  id: z.string(),
  matchIds: z.array(z.string()),
  score: z.string(),
  title: z.string(),
  subtitle: z.string(),
  guildIconUrl: z.string().nullable().optional(),
  teams: z.array(trackerSeriesTeamSchema).optional(),
});
export type TrackerSeriesGroup = z.infer<typeof trackerSeriesGroupSchema>;

export const trackerLiveViewSchema = z.object({
  trackerId: z.string(),
  gamertag: z.string(),
  status: trackerStatusSchema,
  matches: z.array(trackerMatchSummarySchema),
  series: z.array(trackerSeriesGroupSchema),
  lastUpdateTime: z.string(),
  lastMatchDiscoveredAt: z.string().nullable(),
});
export type TrackerLiveView = z.infer<typeof trackerLiveViewSchema>;

export const topBarStatItemSchema = z.object({
  label: z.string(),
  value: z.string(),
});
export type TopBarStatItem = z.infer<typeof topBarStatItemSchema>;

export const trackerViewStateSchema = trackerLiveViewSchema.extend({
  isLive: z.boolean(),
  streamerSettings: streamerViewSettingsSchema.optional(),
  topBarStats: z.array(topBarStatItemSchema).optional(),
});
export type TrackerViewState = z.infer<typeof trackerViewStateSchema>;

export const trackerViewContract = defineContract(z.object({ view: trackerViewStateSchema }));
export type TrackerViewResponse = z.infer<typeof trackerViewContract.schema>;

export const trackerViewMessageSchema = z.object({
  type: z.literal("view"),
  view: trackerLiveViewSchema,
});
export type TrackerViewMessage = z.infer<typeof trackerViewMessageSchema>;

export const trackerViewMessageContract = defineMessageContract(trackerViewMessageSchema);
