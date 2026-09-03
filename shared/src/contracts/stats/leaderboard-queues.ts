import { z } from "zod";
import { defineContract } from "../base";

export const leaderboardQueuesContract = defineContract(
  z.object({
    guildId: z.string(),
    queueChannelIds: z.array(z.string()),
  }),
);

export type LeaderboardQueuesResponse = z.infer<typeof leaderboardQueuesContract.schema>;
