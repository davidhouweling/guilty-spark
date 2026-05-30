import { z } from "zod";

export const authStartQuerySchema = z.object({
  redirect: z.string().optional(),
});
