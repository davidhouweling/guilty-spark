import { z } from "zod";
import { defineContract } from "../base";

/**
 * Session state is a discriminated union on `authenticated`: an authenticated
 * session always carries `userId` and `expiresAt`, so callers that narrow on
 * `authenticated === true` get those fields without optional-chaining.
 */
export const sessionContract = defineContract(
  z.discriminatedUnion("authenticated", [
    z.object({
      authenticated: z.literal(true),
      userId: z.string(),
      expiresAt: z.number(),
      avatarUrl: z.string().optional(),
      xboxGamertag: z.string().optional(),
      xboxXuid: z.string().optional(),
    }),
    z.object({
      authenticated: z.literal(false),
      expired: z.boolean().optional(),
    }),
  ]),
);

export type SessionResponse = z.infer<typeof sessionContract.schema>;
