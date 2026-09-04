import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import { leaderboardContract, leaderboardQuerySchema } from "@guilty-spark/shared/contracts/leaderboard/leaderboard";
import { leaderboardQueuesContract } from "@guilty-spark/shared/contracts/leaderboard/leaderboard-queues";
import type { APIChannel } from "discord-api-types/v10";
import type { RoutesRegisterHandler } from "../base/types";

export const leaderboardRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/leaderboard/queues", async (request, env: Env) => {
    const services = installServices({ env });

    try {
      const guildId = new URL(request.url).searchParams.get("guildId");
      if (guildId == null || guildId === "") {
        return errorContract.toResponse({ error: "Invalid query parameters" }, { status: 400, noStore: true });
      }

      const queueChannelIds = await services.databaseService.getLeaderboardQueueChannelIds(guildId);
      let guildName = `Guild ${guildId}`;
      try {
        const guild = await services.discordService.getGuild(guildId);
        if (guild.name.trim() !== "") {
          guildName = guild.name.trim();
        }
      } catch (error) {
        services.logService.warn(
          error,
          new Map([
            ["guildId", guildId],
            ["reason", "Failed to resolve leaderboard guild name"],
          ]),
        );
      }

      let channels: APIChannel[] = [];
      if (queueChannelIds.length > 0) {
        try {
          channels = await services.discordService.getGuildChannels(guildId);
        } catch (error) {
          services.logService.warn(
            error,
            new Map([
              ["guildId", guildId],
              ["reason", "Failed to resolve leaderboard queue names"],
            ]),
          );
        }
      }
      const channelsById = new Map(channels.map((channel) => [channel.id, channel]));
      const queueOptions = queueChannelIds.map((channelId) => {
        const channel = channelsById.get(channelId);
        const label = channel?.name == null || channel.name === "" ? `Queue ${channelId}` : `#${channel.name}`;
        return { channelId, label };
      });
      return leaderboardQueuesContract.toResponse(
        { guildId, guildName, queueChannelIds, queueOptions },
        { noStore: true },
      );
    } catch (error) {
      services.logService.error(error, new Map([["context", "Failed to resolve leaderboard queues route"]]));
      return errorContract.toResponse(
        { error: "Failed to resolve leaderboard queues" },
        { status: 500, noStore: true },
      );
    }
  });

  router.get("/api/leaderboard", async (request, env: Env) => {
    const services = installServices({ env });
    const { leaderboardService, logService } = services;

    try {
      const url = new URL(request.url);
      const queryParams = parseQueryParams(url, leaderboardQuerySchema, "Invalid query parameters");
      if (!queryParams.success) {
        return queryParams.response;
      }

      const { guildId, queueChannelId, window, metric, page, pageSize, minGamesPlayed } = queryParams.data;
      const response = await leaderboardService.getLeaderboard({
        guildId,
        ...(queueChannelId != null ? { queueChannelId } : {}),
        ...(window != null ? { window } : {}),
        ...(metric != null ? { metric } : {}),
        ...(page != null ? { page } : {}),
        ...(pageSize != null ? { pageSize } : {}),
        ...(minGamesPlayed != null ? { minGamesPlayed } : {}),
        autoCreateConfig: false,
      });
      if (!response.hasLeaderboardData) {
        return errorContract.toResponse({ error: "Leaderboard not found" }, { status: 404, noStore: true });
      }

      return leaderboardContract.toResponse(response, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Failed to resolve leaderboard route"]]));
      return errorContract.toResponse({ error: "Failed to resolve leaderboard" }, { status: 500, noStore: true });
    }
  });
};
