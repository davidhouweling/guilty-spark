import { z } from "zod";
import { defineContract } from "../base";
import { preSeriesPlayerInfoSchema } from "../individual-tracker/view";

export const livePreSeriesPlayerSchema = z.object({
  playerId: z.string(),
  teamIndex: z.number().int().nonnegative(),
  // Roster admission time from tracker start/substitution, not an exact Halo capture timestamp.
  rosterJoinedAt: z.string(),
  captured: preSeriesPlayerInfoSchema
    .extend({
      discordId: z.string(),
      discordName: z.string(),
      xboxId: z.string().nullable(),
      gamertag: z.string().nullable(),
    })
    .nullable(),
});

export const livePreSeriesContract = defineContract(
  z.discriminatedUnion("status", [
    z.object({
      status: z.literal("resolved"),
      guildId: z.string(),
      queueNumber: z.number().int().positive(),
      trackerStatus: z.enum(["active", "paused"]),
      seriesStartedAt: z.string(),
      // Derived from roster/captured identities; ordinary polls do not invalidate this value.
      rosterRevision: z.string(),
      players: z.array(livePreSeriesPlayerSchema),
    }),
    z.object({
      status: z.literal("not-found").describe("No active roster, including trackers removed by stop/disposal"),
    }),
  ]),
);

export type LivePreSeriesPlayer = z.infer<typeof livePreSeriesPlayerSchema>;
export type LivePreSeriesResponse = z.infer<typeof livePreSeriesContract.schema>;
