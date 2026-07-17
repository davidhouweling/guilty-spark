import { z } from "zod";
import { streamerViewSettingsSchema } from "../../individual-tracker/streamer-view-settings";
import { defineContract, defineMessageContract } from "../base";
import { trackerViewStateSchema } from "./view";

export const trackerDirectoryEntrySchema = trackerViewStateSchema.omit({ streamerSettings: true });
export type TrackerDirectoryEntry = z.infer<typeof trackerDirectoryEntrySchema>;

export const trackerDirectorySchema = z.object({
  trackers: z.array(trackerDirectoryEntrySchema),
  liveTrackerId: z.string().nullable(),
  streamerSettings: streamerViewSettingsSchema,
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
