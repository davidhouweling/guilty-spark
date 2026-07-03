import { z } from "zod";
import { defineContract } from "../../base";
import {
  preSeriesPlayerInfoSchema,
  statsHighlightItemSchema,
  trackerLiveViewSchema,
} from "../../individual-tracker/view";
import { individualTrackerStateSchema } from "./lifecycle";

export const individualTrackerStatusContract = defineContract(
  z.object({ state: individualTrackerStateSchema.nullable() }),
);
export type IndividualTrackerStatusResponse = z.infer<typeof individualTrackerStatusContract.schema>;

const individualTrackerViewStateSchema = trackerLiveViewSchema.extend({
  statsHighlights: z.array(statsHighlightItemSchema).optional(),
  preSeriesPlayerInfo: preSeriesPlayerInfoSchema.optional(),
});
export type IndividualTrackerViewState = z.infer<typeof individualTrackerViewStateSchema>;

export const individualTrackerViewStateContract = defineContract(
  z.object({ state: individualTrackerViewStateSchema.nullable() }),
);
export type IndividualTrackerViewStateResponse = z.infer<typeof individualTrackerViewStateContract.schema>;

export const individualTrackerSelectMatchesContract = defineContract(z.object({ success: z.literal(true) }));
export type IndividualTrackerSelectMatchesResponse = z.infer<typeof individualTrackerSelectMatchesContract.schema>;

export const individualTrackerRefreshContract = defineContract(z.object({ success: z.literal(true) }));
export type IndividualTrackerRefreshResponse = z.infer<typeof individualTrackerRefreshContract.schema>;
