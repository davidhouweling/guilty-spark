import { z } from "zod";
import { streamerViewSettingsSchema } from "../../individual-tracker/streamer-view-settings";
import { defineContract, defineMessageContract } from "../base";
import { trackerStatusSchema } from "./tracker";

export const trackerMatchOutcomeSchema = z.enum(["Win", "Loss", "Tie", "DNF", "Unknown"]);
export type TrackerMatchOutcome = z.infer<typeof trackerMatchOutcomeSchema>;

export const trackerMatchSummarySchema = z.object({
  matchId: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  mapAssetId: z.string(),
  mapVersionId: z.string(),
  mapName: z.string(),
  modeAssetId: z.string(),
  gameVariantCategory: z.number(),
  mapBackgroundUrl: z.string().optional(),
  outcome: trackerMatchOutcomeSchema,
  score: z.string(),
  killsDeathsAssistsKda: z.string(),
  damageDealtTakenRatio: z.string(),
  isMatchmaking: z.boolean(),
});
export type TrackerMatchSummary = z.infer<typeof trackerMatchSummarySchema>;

export const trackerSeriesPlayerSchema = z.object({
  discordId: z.string().nullable(),
  discordName: z.string().nullable(),
  gamertag: z.string().nullable(),
  xboxId: z.string().nullable(),
  currentRank: z.number().nullable().optional(),
  currentRankTier: z.string().nullable().optional(),
  currentRankSubTier: z.number().nullable().optional(),
  currentRankMeasurementMatchesRemaining: z.number().nullable().optional(),
  currentRankInitialMeasurementMatches: z.number().nullable().optional(),
  allTimePeakRank: z.number().nullable().optional(),
  esra: z.number().nullable().optional(),
  lastRankedGamePlayed: z.string().nullable().optional(),
});
export type TrackerSeriesPlayer = z.infer<typeof trackerSeriesPlayerSchema>;

export const trackerSeriesTeamSchema = z.object({
  id: z.number().int().min(0),
  name: z.string(),
  players: z.array(trackerSeriesPlayerSchema),
});
export type TrackerSeriesTeam = z.infer<typeof trackerSeriesTeamSchema>;

export const trackerSeriesGroupSchema = z.object({
  id: z.string(),
  matchIds: z.array(z.string()),
  matchBackgroundUrls: z.array(z.string()).optional(),
  score: z.string(),
  killsDeathsAssistsKda: z.string().optional(),
  damageDealtTakenRatio: z.string().optional(),
  title: z.string(),
  subtitle: z.string(),
  guildIconUrl: z.string().nullable().optional(),
  teams: z.array(trackerSeriesTeamSchema).optional(),
});
export type TrackerSeriesGroup = z.infer<typeof trackerSeriesGroupSchema>;

export const trackerActiveSeriesContextSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable(),
  guildIconUrl: z.string().nullable().optional(),
  startedAt: z.string().optional(),
  teams: z.array(trackerSeriesTeamSchema),
});
export type TrackerActiveSeriesContext = z.infer<typeof trackerActiveSeriesContextSchema>;

export const trackerLiveViewSchema = z.object({
  trackerId: z.string(),
  gamertag: z.string(),
  status: trackerStatusSchema,
  matches: z.array(trackerMatchSummarySchema),
  series: z.array(trackerSeriesGroupSchema),
  lastUpdateTime: z.string(),
  lastMatchDiscoveredAt: z.string().nullable(),
  lastSuccessfulFetch: z.string().optional(),
  hasActiveSeries: z.boolean(),
  hasRecentCompletedSeries: z.boolean(),
  searchStartTime: z.string().optional(),
  activeSeriesContext: trackerActiveSeriesContextSchema.optional(),
});
export type TrackerLiveView = z.infer<typeof trackerLiveViewSchema>;

export const statsHighlightRankIconSchema = z.object({
  rankTier: z.string().nullable(),
  subTier: z.number().nullable(),
  measurementMatchesRemaining: z.number().nullable(),
  initialMeasurementMatches: z.number().nullable(),
});
export type StatsHighlightRankIcon = z.infer<typeof statsHighlightRankIconSchema>;

export const statsHighlightItemSchema = z.object({
  label: z.string(),
  value: z.string(),
  rankIcon: statsHighlightRankIconSchema.optional(),
});
export type StatsHighlightItem = z.infer<typeof statsHighlightItemSchema>;

export const preSeriesPlayerInfoSchema = z.object({
  currentRank: z.number().nullable(),
  currentRankTier: z.string().nullable(),
  currentRankSubTier: z.number().nullable(),
  currentRankMeasurementMatchesRemaining: z.number().nullable(),
  currentRankInitialMeasurementMatches: z.number().nullable(),
  allTimePeakRank: z.number().nullable(),
  esra: z.number().nullable(),
  lastRankedGamePlayed: z.string().nullable(),
});
export type PreSeriesPlayerInfo = z.infer<typeof preSeriesPlayerInfoSchema>;

export const trackerViewStateSchema = trackerLiveViewSchema.extend({
  isLive: z.boolean(),
  streamerSettings: streamerViewSettingsSchema.optional(),
  statsHighlights: z.array(statsHighlightItemSchema).optional(),
  preSeriesPlayerInfo: preSeriesPlayerInfoSchema.optional(),
});
export type TrackerViewState = z.infer<typeof trackerViewStateSchema>;

export const trackerViewContract = defineContract(z.object({ view: trackerViewStateSchema }));
export type TrackerViewResponse = z.infer<typeof trackerViewContract.schema>;

export const trackerLiveMessageViewSchema = trackerLiveViewSchema.extend({
  statsHighlights: z.array(statsHighlightItemSchema).optional(),
  preSeriesPlayerInfo: preSeriesPlayerInfoSchema.optional(),
});
export type TrackerLiveMessageView = z.infer<typeof trackerLiveMessageViewSchema>;

export const trackerViewMessageSchema = z.object({
  type: z.literal("view"),
  view: trackerLiveMessageViewSchema,
});
export type TrackerViewMessage = z.infer<typeof trackerViewMessageSchema>;

export const trackerViewMessageContract = defineMessageContract(trackerViewMessageSchema);
