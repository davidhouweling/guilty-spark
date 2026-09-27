import { z } from "zod";
import { defineContract } from "../base";
import { matchAnalyticsSchema, requestedModulesQuerySchema } from "./match-analytics";

export const BATCH_MATCH_ANALYTICS_MAX_MATCH_IDS = 5;

const matchIdsQuerySchema = z
  .string()
  .transform((raw) => {
    return raw
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
  })
  .pipe(z.array(z.string()).min(1).max(BATCH_MATCH_ANALYTICS_MAX_MATCH_IDS));

export const batchMatchAnalyticsQuerySchema = z.object({
  matchIds: matchIdsQuerySchema,
  modules: requestedModulesQuerySchema,
});

export type BatchMatchAnalyticsQuery = z.infer<typeof batchMatchAnalyticsQuerySchema>;

export const batchMatchAnalyticsContract = defineContract(
  z.object({
    results: z.record(z.string(), matchAnalyticsSchema.nullable()),
  }),
);

export type BatchMatchAnalyticsResult = z.infer<typeof batchMatchAnalyticsContract.schema>;
