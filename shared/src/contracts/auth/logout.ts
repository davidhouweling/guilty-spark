import { z } from "zod";
import { defineContract } from "../base";

export const logoutContract = defineContract(
  z.object({
    success: z.boolean(),
  }),
);

export type LogoutResponse = z.infer<typeof logoutContract.schema>;
