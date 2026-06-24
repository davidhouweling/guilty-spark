import { z } from "zod";
import { defineContract } from "../base";

const matchIdsQuerySchema = z
  .string()
  .transform((raw) =>
    raw
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  )
  .pipe(z.array(z.string()).min(1).max(12));

export const seriesMatchesQuerySchema = z.object({
  matchIds: matchIdsQuerySchema,
});
export type SeriesMatchesQuery = z.infer<typeof seriesMatchesQuerySchema>;

export const seriesMatchesContract = defineContract(
  z.object({
    medalMetadata: z.record(
      z.string().regex(/^\d+$/),
      z.object({ name: z.string(), sortingWeight: z.number() }),
    ),
    playerXuidToGametag: z.record(z.string(), z.string()),
    matches: z.array(
      z.object({
        matchId: z.string(),
        gameTypeAndMap: z.string(),
        gameVariantCategory: z.number().int().nonnegative(),
        gameType: z.string(),
        gameMap: z.string(),
        gameMapThumbnailUrl: z.string(),
        duration: z.string(),
        gameScore: z.string(),
        gameSubScore: z.string().nullable(),
        startTime: z.string(),
        endTime: z.string(),
        rawMatch: z.unknown(),
      }),
    ),
  }),
);

export type SeriesMatchesResponse = z.infer<typeof seriesMatchesContract.schema>;
export type SeriesMatchEntry = SeriesMatchesResponse["matches"][number];
