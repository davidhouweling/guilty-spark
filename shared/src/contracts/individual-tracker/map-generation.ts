import { z } from "zod";
import { defineContract } from "../base";
import { liveTrackerMapSchema } from "../durable-objects/live-tracker/maps";

export const MAP_GENERATOR_COUNTS: readonly number[] = [1, 3, 5, 7, 9, 11, 13];
export const MAP_GENERATOR_PLAYLISTS = ["C", "H", "R", "S", "N", "T", "D", "F", "Q"] as const;
export const MAP_GENERATOR_FORMATS = ["H", "R", "O", "S"] as const;
export const MAP_GENERATOR_SLAYER_ONLY_PLAYLISTS = ["S", "N", "T", "F"] as const;

export const generateMapsPlaylistSchema = z.enum(MAP_GENERATOR_PLAYLISTS);
export const generateMapsFormatSchema = z.enum(MAP_GENERATOR_FORMATS);

export const generateMapsRequestSchema = z.object({
  playlist: generateMapsPlaylistSchema,
  format: generateMapsFormatSchema,
  count: z
    .number()
    .int()
    .refine((count) => MAP_GENERATOR_COUNTS.includes(count), {
      message: "Unsupported map count",
    }),
});
export type GenerateMapsRequest = z.infer<typeof generateMapsRequestSchema>;

export const generateMapsContract = defineContract(z.object({ maps: z.array(liveTrackerMapSchema) }));
export type GenerateMapsResponse = z.infer<typeof generateMapsContract.schema>;
