import { z } from "zod";
import { defineContract } from "../base";
import { liveTrackerMapSchema } from "../durable-objects/live-tracker/maps";

export const MAP_GENERATOR_COUNTS: readonly number[] = [1, 3, 5, 7, 9, 11, 13];

export const generateMapsRequestSchema = z.object({
  playlist: z.string().trim().min(1).max(20),
  format: z.string().trim().min(1).max(20),
  count: z.number().int().refine((count) => MAP_GENERATOR_COUNTS.includes(count), {
    message: "Unsupported map count",
  }),
});
export type GenerateMapsRequest = z.infer<typeof generateMapsRequestSchema>;

export const generateMapsContract = defineContract(z.object({ maps: z.array(liveTrackerMapSchema) }));
export type GenerateMapsResponse = z.infer<typeof generateMapsContract.schema>;