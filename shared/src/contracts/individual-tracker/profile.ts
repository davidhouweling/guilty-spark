import { z } from "zod";
import { defineContract } from "../base";

export const trackerProfileSchema = z.object({
  profileId: z.string(),
  activeIdentityId: z.string().nullable(),
  name: z.string(),
});
export type TrackerProfile = z.infer<typeof trackerProfileSchema>;

export const trackerProfileContract = defineContract(z.object({ profile: trackerProfileSchema }));
export type TrackerProfileResponse = z.infer<typeof trackerProfileContract.schema>;

export const updateTrackerProfileRequestSchema = z.object({
  profileId: z.string().min(1),
  name: z.string().optional(),
  activeIdentityId: z.string().nullable().optional(),
});
export type UpdateTrackerProfileRequest = z.infer<typeof updateTrackerProfileRequestSchema>;
