import { z } from "zod";
import { defineContract } from "../base";

export const leaderboardQueuesContract = defineContract(
  z.object({
    guildId: z.string(),
    guildName: z.string(),
    queueChannelIds: z.array(z.string()),
    queueOptions: z.array(
      z.object({
        channelId: z.string(),
        label: z.string(),
      }),
    ),
  }),
);

export type LeaderboardQueuesResponse = z.infer<typeof leaderboardQueuesContract.schema>;
