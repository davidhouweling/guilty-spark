import { z } from "zod";
import { streamerViewSettingsSchema } from "../../individual-tracker/streamer-view-settings";
import { defineContract, defineMessageContract } from "../base";
import { trackerStatusSchema } from "./tracker";

export const trackerDirectoryEntrySchema = z.object({
  trackerId: z.string(),
  gamertag: z.string(),
  status: trackerStatusSchema,
  isLive: z.boolean(),
  accumulated: z.object({
    total: z.number(),
    wins: z.number(),
    losses: z.number(),
    ties: z.number(),
  }),
});
export type TrackerDirectoryEntry = z.infer<typeof trackerDirectoryEntrySchema>;

export const trackerDirectorySchema = z.object({
  trackers: z.array(trackerDirectoryEntrySchema),
  streamerSettings: streamerViewSettingsSchema.optional(),
});
export type TrackerDirectory = z.infer<typeof trackerDirectorySchema>;

export const trackerDirectoryContract = defineContract(trackerDirectorySchema);
export type TrackerDirectoryResponse = z.infer<typeof trackerDirectoryContract.schema>;

export const trackerDirectoryMessageSchema = z.object({
  type: z.literal("directory"),
  directory: trackerDirectorySchema,
});
export type TrackerDirectoryMessage = z.infer<typeof trackerDirectoryMessageSchema>;

export const trackerDirectoryMessageContract = defineMessageContract(trackerDirectoryMessageSchema);
