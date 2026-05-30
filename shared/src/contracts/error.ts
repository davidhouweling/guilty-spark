import { z } from "zod";
import { defineContract } from "./base";

export const errorContract = defineContract(
  z.object({
    error: z.string(),
  }),
);

export type ErrorResponse = z.infer<typeof errorContract.schema>;
