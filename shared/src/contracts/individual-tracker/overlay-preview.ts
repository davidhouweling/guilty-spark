import { z } from "zod";
import { defineContract } from "../base";
import { streamerViewSettingsSchema } from "../../individual-tracker/streamer-view-settings";
import { trackerViewStateSchema } from "./view";

export const overlayPreviewModeSchema = z.enum(["matchmaking", "series"]);
export type OverlayPreviewMode = z.infer<typeof overlayPreviewModeSchema>;

export const overlayPreviewRequestSchema = z.object({
  mode: overlayPreviewModeSchema.default("matchmaking"),
  previewSettings: streamerViewSettingsSchema.optional(),
});
export type OverlayPreviewRequest = z.infer<typeof overlayPreviewRequestSchema>;

// A real tracker view has one truth (`hasActiveSeries`), but the setup page has to show both
// overlay states, so the requested mode is part of the contract rather than inferred.
export const overlayPreviewContract = defineContract(
  z.object({
    view: trackerViewStateSchema,
    mode: overlayPreviewModeSchema,
    isExample: z.boolean(),
  }),
);
export type OverlayPreviewResponse = z.infer<(typeof overlayPreviewContract)["schema"]>;
