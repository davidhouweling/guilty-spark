import { z } from "zod";
import { defineContract } from "../base";
import { streamerViewSettingsSchema } from "../../individual-tracker/streamer-view-settings";

export const settingsBodySchema = z.object({ settings: streamerViewSettingsSchema });

export const settingsContract = defineContract(settingsBodySchema);
export type SettingsResponse = z.infer<typeof settingsContract.schema>;
