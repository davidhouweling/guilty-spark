import { z } from "zod";
import { defineContract } from "../../base";

export const authStartQuerySchema = z.object({
  redirect: z.string().optional(),
});

export const microsoftStartContract = defineContract(
  z.object({
    authUrl: z.string(),
    state: z.string(),
  }),
);

export type MicrosoftStartResponse = z.infer<typeof microsoftStartContract.schema>;
