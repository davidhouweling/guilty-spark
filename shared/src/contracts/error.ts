import { z } from "zod";
import { defineContract } from "./base";

/**
 * Standard error envelope returned by every failing API route, so clients can
 * surface a consistent message regardless of which endpoint failed.
 */
export const errorContract = defineContract(
  z.object({
    error: z.string(),
  }),
);

export type ErrorResponse = z.infer<typeof errorContract.schema>;
