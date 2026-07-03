import { z } from "zod";
import { defineContract, defineMessageContract } from "../../base";
import { trackerDirectorySchema } from "../../individual-tracker/follow";
import { userTrackerStateSchema } from "./lifecycle";

export const userTrackerViewStateSchema = z.object({
  userId: z.string(),
  lastUpdateTime: z.string(),
  directory: trackerDirectorySchema,
});
export type UserTrackerViewState = z.infer<typeof userTrackerViewStateSchema>;

export const userTrackerStatusContract = defineContract(z.object({ state: userTrackerStateSchema.nullable() }));
export type UserTrackerStatusResponse = z.infer<typeof userTrackerStatusContract.schema>;

export const userTrackerViewStateContract = defineContract(z.object({ state: userTrackerViewStateSchema.nullable() }));
export type UserTrackerViewStateResponse = z.infer<typeof userTrackerViewStateContract.schema>;

export const userTrackerDirectoryMessageSchema = z.object({
  type: z.literal("directory"),
  directory: trackerDirectorySchema,
});
export type UserTrackerDirectoryMessage = z.infer<typeof userTrackerDirectoryMessageSchema>;

export const userTrackerDirectoryMessageContract = defineMessageContract(userTrackerDirectoryMessageSchema);
