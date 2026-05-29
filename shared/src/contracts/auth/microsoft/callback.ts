import { z } from "zod";

export const authCallbackQuerySchema = z.object({
  code: z.string(),
  state: z.string(),
});
