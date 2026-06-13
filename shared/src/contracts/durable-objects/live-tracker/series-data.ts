import { z } from "zod";
import { defineContract } from "../../base";
import { substitutionSchema, teamMappingSchema } from "./lifecycle";

export const liveTrackerSeriesDataContract = defineContract(
  z.object({
    seriesId: z.object({
      guildId: z.string(),
      queueNumber: z.number(),
    }),
    teams: z.array(teamMappingSchema),
    seriesScore: z.string(),
    matchIds: z.array(z.string()),
    discoveredMatches: z.record(z.string(), z.unknown()),
    rawMatches: z.array(z.unknown()),
    playersAssociationData: z.record(z.string(), z.unknown()),
    substitutions: z.array(substitutionSchema),
    startTime: z.string(),
    lastUpdateTime: z.string(),
  }),
);
export type LiveTrackerSeriesDataResponse = z.infer<typeof liveTrackerSeriesDataContract.schema>;
