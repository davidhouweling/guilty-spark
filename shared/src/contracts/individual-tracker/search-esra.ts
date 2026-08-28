import { z } from "zod";
import { defineContract } from "../base";

export const searchEsraParamsSchema = z.object({ xuid: z.string().min(1) });
export type SearchEsraParams = z.infer<typeof searchEsraParamsSchema>;

export const searchEsraSchema = z.object({
  esra: z.number().nullable(),
  lastRankedGamePlayed: z.string().nullable(),
});
export type SearchEsra = z.infer<typeof searchEsraSchema>;

export const searchEsraContract = defineContract(z.object({ esra: searchEsraSchema }));
export type SearchEsraResponse = z.infer<typeof searchEsraContract.schema>;
