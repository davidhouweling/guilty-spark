import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
} from "discord-api-types/v10";
import { InteractionResponseType, MessageFlags, PermissionFlagsBits, ComponentType } from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { EndUserError } from "../../base/end-user-error";
import type { ExecuteResponse } from "../base/base-command";
import type { FixSeriesSource } from "./stats-flow-types";
import { InteractionButton } from "./stats-interaction-button";
import { getFixQueueData, getQueueDataFromThreadStarterMessage } from "./stats-fix-source";
import { StatsManualConfirmCommand } from "./stats-manual-confirm-command";

export abstract class StatsFixEntryCommand extends StatsManualConfirmCommand {
  protected handleFixSubCommand(
    interaction: APIApplicationCommandInteraction,
    options: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>,
  ): ExecuteResponse {
    const queueNumber = options.get("queue_number") as number | undefined;
    const isThreadChannel = this.isThreadChannel(interaction.channel.type);

    if (!isThreadChannel && queueNumber == null) {
      throw new EndUserError("queue_number is required when running /stats fix outside a thread.");
    }

    if (isThreadChannel && queueNumber == null) {
      return {
        response: {
          type: InteractionResponseType.DeferredChannelMessageWithSource,
          data: { flags: MessageFlags.Ephemeral },
        },
        jobToComplete: async () => this.fixSubCommandInThreadJob(interaction),
      };
    }

    const parentChannelId = "parent_id" in interaction.channel ? interaction.channel.parent_id : undefined;
    const channelId = isThreadChannel ? (parentChannelId ?? interaction.channel.id) : interaction.channel.id;

    return {
      response: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral },
      },
      jobToComplete: async () => this.fixSubCommandJob(interaction, channelId, Preconditions.checkExists(queueNumber)),
    };
  }

  private async fixSubCommandJob(
    interaction: APIApplicationCommandInteraction,
    channelId: string,
    queueNumber: number,
  ): Promise<void> {
    const { discordService } = this.services;

    try {
      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
      const fixSource = await getFixQueueData(discordService, guildId, channelId, queueNumber);
      await this.fixCommandStartFlow(interaction, fixSource);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async fixSubCommandInThreadJob(interaction: APIApplicationCommandInteraction): Promise<void> {
    const { discordService } = this.services;

    try {
      if (!this.isThreadChannel(interaction.channel.type)) {
        throw new EndUserError("This command must be run in a thread channel.");
      }

      const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
      const threadId = interaction.channel.id;
      const parentChannelId = "parent_id" in interaction.channel ? interaction.channel.parent_id : undefined;
      const channelId = parentChannelId ?? threadId;
      const queueNumber = await discordService.findQueueNumberForThread(guildId, threadId);
      const fixSource =
        queueNumber != null
          ? await getFixQueueData(discordService, guildId, channelId, queueNumber)
          : await getQueueDataFromThreadStarterMessage(
              discordService,
              this.env.DISCORD_APP_ID,
              guildId,
              channelId,
              threadId,
            );

      await this.fixCommandStartFlow(interaction, fixSource);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async fixCommandStartFlow(
    interaction: APIApplicationCommandInteraction,
    fixSource: FixSeriesSource,
  ): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;
    const { channelId, queueData } = fixSource;
    const guildId = Preconditions.checkExists(interaction.guild_id, "No guild ID found in interaction");
    const userId = discordService.getDiscordUserId(interaction);
    const permissions = await discordService.computeMemberPermissions(guildId, userId);
    const isAdmin = (permissions & PermissionFlagsBits.Administrator) !== 0n;
    const queuePlayers = queueData.teams.flatMap((team) => team.players);
    const queuePlayerIds = new Set(queuePlayers.map((player) => player.user.id));

    if (!isAdmin && !queuePlayerIds.has(userId)) {
      throw new EndUserError("Only players from that queue (or admins) can run /stats fix.");
    }

    const discordAssociations = await databaseService.getDiscordAssociations([...queuePlayerIds]);
    const xboxIds = discordAssociations.flatMap((association) =>
      association.XboxId !== "" ? [association.XboxId] : [],
    );
    const usersByXuid = xboxIds.length > 0 ? await haloService.getUsersByXuids(xboxIds) : [];
    const xuidToGamertag = new Map(usersByXuid.map((user) => [user.xuid, user.gamertag]));
    const discordIdToGamertag = new Map<string, string>();
    for (const association of discordAssociations) {
      if (association.XboxId === "") {
        continue;
      }

      const gamertag = xuidToGamertag.get(association.XboxId);
      if (gamertag == null || gamertag === "") {
        continue;
      }

      discordIdToGamertag.set(association.DiscordId, gamertag);
    }

    const selectOptions = queueData.teams
      .flatMap((team) =>
        team.players
          .filter((player) => discordIdToGamertag.has(player.user.id))
          .map((player) => {
            const label = player.nick ?? player.user.global_name ?? player.user.username;
            const gamertag = Preconditions.checkExists(discordIdToGamertag.get(player.user.id));

            return {
              label: label.slice(0, 100),
              value: player.user.id,
              description: `Gamertag: ${gamertag}`.slice(0, 100),
            };
          }),
      )
      .slice(0, 25);

    if (selectOptions.length === 0) {
      throw new EndUserError(
        "No players in that queue have a connected Halo account. Ask a player to run /connect first.",
      );
    }

    const message = await discordService.updateDeferredReply(interaction.token, {
      embeds: [this.createStatusEmbed("Select a player from the queue to load candidate custom games.")],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: InteractionButton.FixPlayerSelect,
              min_values: 1,
              max_values: 1,
              options: selectOptions,
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              custom_id: InteractionButton.FixCancel,
              label: "Cancel",
              style: 2,
            },
          ],
        },
      ],
    });

    const queueDataWithoutTimestamp = {
      message: queueData.message,
      queue: queueData.queue,
      teams: queueData.teams,
    };
    await this.setFixMetadata(message.id, {
      guildId,
      channelId,
      sourceKind: fixSource.sourceKind,
      isManualSeries: fixSource.isManualSeries,
      queueData: queueDataWithoutTimestamp,
    });
  }
}
