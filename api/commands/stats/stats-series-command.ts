import type { APIEmbed } from "discord-api-types/v10";
import { ComponentType, PermissionFlagsBits } from "discord-api-types/v10";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { NEAT_QUEUE_BOT_USER_ID } from "../../services/discord/discord";
import type { QueueData } from "../../services/discord/discord";
import { SeriesPlayersEmbed } from "../../embeds/stats/series-players-embed";
import { SeriesOverviewEmbed } from "../../embeds/stats/series-overview-embed";
import type { SeriesOverviewEmbedOutput } from "../../embeds/stats/series-overview-embed";
import { SeriesTeamsEmbed } from "../../embeds/stats/series-teams-embed";
import { mapManualSeriesToStableTeams } from "../../services/halo/manual-series-team-mapping";
import type { ManualSeriesTeamMappings } from "../../services/halo/manual-series-team-mapping";
import { buildDiscordSeriesRenderDataFromMatches } from "../../services/discord/discord-series-stats";
import type { GuildConfigRow } from "../../services/database/types/guild_config";
import { StatsReturnType } from "../../services/database/types/guild_config";
import { toMissingPermissionsError } from "../../base/missing-permissions-error";
import { InteractionButton } from "./stats-interaction-button";
import { StatsCompareFiltersCommand } from "./stats-compare-filters-command";

export abstract class StatsSeriesCommand extends StatsCompareFiltersCommand {
  protected async postSeriesStatsToThread(
    threadId: string,
    series: MatchStats[],
    guildConfig: GuildConfigRow,
    locale: string,
    allowLoadGamesButton = true,
    postedMessageIds?: string[],
    teamMappings?: ManualSeriesTeamMappings,
  ): Promise<void> {
    const { discordService } = this.services;

    try {
      await this.postSeriesEmbedsToThread(threadId, series, guildConfig, locale, postedMessageIds, teamMappings);
      await this.postGameStatsOrButton(threadId, series, guildConfig, locale, allowLoadGamesButton, postedMessageIds);
    } catch (error) {
      throw (
        toMissingPermissionsError(error, {
          action: "post the series stats",
          permissions: [
            discordService.permissionToString(PermissionFlagsBits.SendMessages),
            discordService.permissionToString(PermissionFlagsBits.SendMessagesInThreads),
          ],
        }) ?? error
      );
    }
  }

  protected async postSeriesEmbedsToThread(
    threadId: string,
    series: MatchStats[],
    guildConfig: GuildConfigRow,
    locale: string,
    postedMessageIds?: string[],
    teamMappings?: ManualSeriesTeamMappings,
  ): Promise<void> {
    const { discordService, haloService } = this.services;

    const seriesTeamsEmbed = new SeriesTeamsEmbed({
      discordService,
      haloService,
      guildConfig,
      locale,
    });
    const teamStatsSeries = teamMappings == null ? series : mapManualSeriesToStableTeams(series, teamMappings);
    const seriesTeamsEmbedOutput = await seriesTeamsEmbed.getSeriesEmbed(teamStatsSeries);
    const seriesTeamsMessage = await discordService.createMessage(threadId, {
      embeds: [seriesTeamsEmbedOutput],
    });
    postedMessageIds?.push(seriesTeamsMessage.id);

    const seriesPlayersEmbed = new SeriesPlayersEmbed({ discordService, haloService, guildConfig, locale });
    const seriesPlayers = await haloService.getPlayerXuidsToGametags(series, { presentAtBeginningOnly: true });
    const seriesPlayersEmbedsOutput = await seriesPlayersEmbed.getSeriesEmbed(teamStatsSeries, seriesPlayers, locale);
    for (const seriesPlayersEmbedOutput of seriesPlayersEmbedsOutput) {
      const seriesPlayersMessage = await discordService.createMessage(threadId, {
        embeds: [seriesPlayersEmbedOutput],
      });
      postedMessageIds?.push(seriesPlayersMessage.id);
    }
  }

  protected async postGameStatsOrButton(
    threadId: string,
    series: MatchStats[],
    guildConfig: GuildConfigRow,
    locale: string,
    allowLoadGamesButton = true,
    postedMessageIds?: string[],
  ): Promise<void> {
    const { discordService, haloService } = this.services;

    if (guildConfig.StatsReturn === StatsReturnType.SERIES_ONLY && allowLoadGamesButton) {
      const loadGamesMessage = await discordService.createMessage(threadId, {
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                custom_id: InteractionButton.LoadGames,
                label: "Load game stats",
                style: 1,
                emoji: {
                  name: "🎮",
                },
              },
            ],
          },
        ],
      });
      postedMessageIds?.push(loadGamesMessage.id);
    } else {
      for (const match of series) {
        const players = await haloService.getPlayerXuidsToGametags(match, { presentAtBeginningOnly: true });
        const matchEmbed = this.getMatchEmbed(guildConfig, match, locale);
        const embed = await matchEmbed.getEmbed(match, players);

        const gameStatsMessage = await discordService.createMessage(threadId, { embeds: [embed] });
        postedMessageIds?.push(gameStatsMessage.id);
      }
    }
  }

  protected async createSeriesEmbed({
    guildId,
    channelId,
    locale,
    queueData,
    series,
  }: {
    guildId: string;
    channelId: string;
    locale: string;
    queueData: Omit<QueueData, "timestamp">;
    series: MatchStats[];
  }): Promise<SeriesOverviewEmbedOutput> {
    const { discordService, haloService } = this.services;
    const seriesOverview = new SeriesOverviewEmbed({ discordService, haloService });
    const isNeatQueueResult = queueData.message.author.id === NEAT_QUEUE_BOT_USER_ID;
    const linkedSource = this.getLinkedQueueSourceFromOverview(queueData.message, guildId);
    const sourceUrl =
      linkedSource != null &&
      (linkedSource.channelId !== queueData.message.channel_id || linkedSource.messageId !== queueData.message.id)
        ? linkedSource.url
        : undefined;
    return seriesOverview.getEmbed({
      guildId,
      channelId,
      ...(isNeatQueueResult ? { messageId: queueData.message.id } : { sourceUrl }),
      pagesUrl: this.env.PAGES_URL,
      locale,
      queue: queueData.queue,
      series,
      finalTeams: queueData.teams.map((team) => ({
        name: team.name,
        playerIds: team.players.map(({ user: { id } }) => id),
        unlinkedGamertags: team.unlinkedGamertags,
      })),
      substitutions: [],
      hideTeamsDescription: false,
    });
  }

  protected async cacheDiscordSeriesStats(
    guildId: string,
    queueNumber: number,
    series: MatchStats[],
    locale: string,
    isManualSeries = false,
    seriesScore?: string,
  ): Promise<void> {
    const { discordService, haloService, logService } = this.services;

    try {
      const renderData = await buildDiscordSeriesRenderDataFromMatches({
        discordService,
        logService,
        haloService,
        guildId,
        queueNumber,
        matches: series,
        locale,
        isManualSeries,
        seriesScore,
      });

      await discordService.cacheResolvedDiscordSeriesStats({
        guildId,
        queueNumber,
        matchIds: renderData.matches.map((match) => match.matchId),
        renderData,
      });
    } catch (error) {
      logService.warn(
        error,
        new Map([
          ["guildId", guildId],
          ["queueNumber", queueNumber.toString()],
          ["reason", "Failed to cache discord series stats directly"],
        ]),
      );
    }
  }

  protected getLinkedQueueSourceFromOverview(
    message: { embeds: APIEmbed[] },
    guildId: string,
  ): { channelId: string; messageId?: string | undefined; url: string } | undefined {
    for (const embed of message.embeds) {
      const { url } = embed;
      const match = /^https:\/\/discord\.com\/channels\/(\d+)\/(\d+)(?:\/(\d+))?$/.exec(url ?? "");
      if (match?.[1] === guildId && match[2] != null) {
        return {
          channelId: match[2],
          ...(match[3] == null ? {} : { messageId: match[3] }),
          url: Preconditions.checkExists(url),
        };
      }
    }
    return undefined;
  }
}
