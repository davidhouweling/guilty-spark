import type {
  APIApplicationCommandInteraction,
  APIEmbed,
  APIUserApplicationCommandDMInteraction,
  APIUserApplicationCommandGuildInteraction,
  RESTPostAPIWebhookWithTokenJSONBody,
} from "discord-api-types/v10";
import { ApplicationCommandOptionType, ApplicationCommandType, InteractionType } from "discord-api-types/v10";
import type { PlaylistCsrContainer } from "halo-infinite-api";
import type { ApplicationCommandData, BaseInteraction, ExecuteResponse } from "../base/base-command.mjs";
import { BaseCommand } from "../base/base-command.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import type { DiscordAssociationsRow } from "../../services/database/types/discord_associations.mjs";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error.mjs";
import { ServiceRecordEmbed } from "../../embeds/service-record/service-record-embed.mjs";
import { Preconditions } from "../../base/preconditions.mjs";

export class ServiceRecordCommand extends BaseCommand {
  override commands: ApplicationCommandData[] = [
    {
      type: ApplicationCommandType.User,
      name: "Service record",
      description: "",
      default_member_permissions: null,
    },
    {
      type: ApplicationCommandType.ChatInput,
      name: "servicerecord",
      description: "View a player's Halo Infinite service record",
      default_member_permissions: null,
      options: [
        {
          name: "player",
          description: "The player to view the service record for",
          type: ApplicationCommandOptionType.User,
          required: true,
        },
      ],
    },
  ];

  protected override handleInteraction(interaction: BaseInteraction): ExecuteResponse {
    const { type } = interaction;

    switch (type) {
      case InteractionType.ApplicationCommand: {
        return this.deferReply(async () => this.applicationCommandJob(interaction), true);
      }
      case InteractionType.MessageComponent:
      case InteractionType.ModalSubmit: {
        throw new Error(`Unsupported interaction type: ${type.toString()}`);
      }
      default: {
        throw new UnreachableError(type);
      }
    }
  }

  private async applicationCommandJob(
    interaction:
      | APIApplicationCommandInteraction
      | APIUserApplicationCommandDMInteraction
      | APIUserApplicationCommandGuildInteraction,
  ): Promise<void> {
    const { discordService, haloService } = this.services;
    const locale = interaction.guild_locale ?? interaction.locale;

    try {
      const targetId = this.getTargetUserIdFromInteractionData(interaction.data);
      const association = await this.getAssociationForUser(targetId);
      const [csrs, users] = await Promise.all([
        haloService.getRankedArenaCsrs([association.XboxId]),
        haloService.getUsersByXuids([association.XboxId]),
      ]);
      const csr = Preconditions.checkExists(csrs.get(association.XboxId), "CSR data not found for Xbox ID");
      const gamertag = Preconditions.checkExists(users[0]?.gamertag, "User data not found for Xbox ID");
      const embed = await this.getHaloServiceRecordEmbed({ locale, association, csr, gamertag });

      const content: RESTPostAPIWebhookWithTokenJSONBody = {
        embeds: [embed],
      };

      await discordService.updateDeferredReply(interaction.token, content);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private getTargetUserIdFromInteractionData(data: APIApplicationCommandInteraction["data"]): string {
    const { type } = data;
    switch (type) {
      case ApplicationCommandType.User: {
        const { target_id } = data as { target_id: string };
        return target_id;
      }
      case ApplicationCommandType.ChatInput: {
        const options = data.options ?? [];
        const playerOption = options.find((option) => option.name === "player");
        if (playerOption?.type !== ApplicationCommandOptionType.User) {
          throw new Error("Player option is missing or invalid");
        }
        return playerOption.value;
      }
      case ApplicationCommandType.Message:
      case ApplicationCommandType.PrimaryEntryPoint: {
        throw new Error(`Unsupported application command type: ${type.toString()}`);
      }
      default: {
        throw new UnreachableError(type);
      }
    }
  }

  private async getAssociationForUser(discordUserId: string): Promise<DiscordAssociationsRow> {
    const { databaseService } = this.services;

    const [association] = await databaseService.getDiscordAssociations([discordUserId]);

    if (association?.XboxId == null || association.XboxId === "") {
      throw new EndUserError(
        "I do not have any data on their Halo account, please ask them to use the `/connect` command to link their Halo account.",
        {
          title: "No Halo Account connected",
          handled: true,
          errorType: EndUserErrorType.WARNING,
        },
      );
    }

    return association;
  }

  private async getHaloServiceRecordEmbed({
    locale,
    association,
    csr,
    gamertag,
  }: {
    locale: string;
    association: DiscordAssociationsRow;
    csr: PlaylistCsrContainer;
    gamertag: string;
  }): Promise<APIEmbed> {
    const { discordService, haloService } = this.services;
    const { DiscordId, AssociationReason, XboxId } = association;

    try {
      const [serviceRecord, esra] = await Promise.allSettled([
        haloService.getServiceRecord(XboxId),
        haloService.getPlayerEsra(XboxId),
      ]);
      if (serviceRecord.status === "rejected") {
        throw serviceRecord.reason;
      }

      const embed = new ServiceRecordEmbed(
        { discordService, haloService },
        {
          locale,
          discordUserId: DiscordId,
          gamertag,
          associationReason: AssociationReason,
          serviceRecord: serviceRecord.value,
          csr,
          esra: esra.status === "fulfilled" ? esra.value : undefined,
        },
      );
      return embed.embed;
    } catch (error) {
      throw new EndUserError("Failed to fetch service record from Halo Infinite", {
        innerError: error as Error,
        handled: true,
        errorType: EndUserErrorType.ERROR,
      });
    }
  }
}
