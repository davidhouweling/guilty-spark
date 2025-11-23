import type {
  APIApplicationCommandInteraction,
  APIButtonComponentWithCustomId,
  APIInteractionResponseCallbackData,
  APIMessageComponentButtonInteraction,
  APIMessageComponentSelectMenuInteraction,
  APIStringSelectComponent,
} from "discord-api-types/v10";
import {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  InteractionResponseType,
  MessageFlags,
  InteractionType,
  ComponentType,
  ButtonStyle,
} from "discord-api-types/v10";
import {
  type ExecuteResponse,
  type BaseInteraction,
  type ApplicationCommandData,
  type CommandData,
  BaseCommand,
} from "../base/base-command.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { type MapMode } from "../../services/halo/hcs.mjs";
import { MapsEmbed, InteractionComponent, mapPlaylistLabels, mapFormatLabels } from "../../embeds/maps-embed.mjs";
import { MapsFormatType, MapsPlaylistType } from "../../services/database/types/guild_config.mjs";

export class MapsCommand extends BaseCommand {
  readonly commands: ApplicationCommandData[] = [
    {
      type: ApplicationCommandType.ChatInput,
      name: "maps",
      description: "Generate a random set of Halo maps (default: HCS)",
      default_member_permissions: null,
      options: [
        {
          type: ApplicationCommandOptionType.Integer,
          name: "count",
          description: "Number of maps to generate (1, 3, 5, 7)",
          required: false,
          choices: [
            { name: "1", value: 1 },
            { name: "3", value: 3 },
            { name: "5", value: 5 },
            { name: "7", value: 7 },
          ],
        },
        {
          type: ApplicationCommandOptionType.String,
          name: "playlist",
          description: "Which playlist to use (default: HCS - Current)",
          required: false,
          choices: [
            { name: mapPlaylistLabels[MapsPlaylistType.HCS_CURRENT], value: MapsPlaylistType.HCS_CURRENT },
            {
              name: mapPlaylistLabels[MapsPlaylistType.HCS_HISTORICAL],
              value: MapsPlaylistType.HCS_HISTORICAL,
            },
            { name: mapPlaylistLabels[MapsPlaylistType.RANKED_ARENA], value: MapsPlaylistType.RANKED_ARENA },
            { name: mapPlaylistLabels[MapsPlaylistType.RANKED_SLAYER], value: MapsPlaylistType.RANKED_SLAYER },
            { name: mapPlaylistLabels[MapsPlaylistType.RANKED_SNIPERS], value: MapsPlaylistType.RANKED_SNIPERS },
            { name: mapPlaylistLabels[MapsPlaylistType.RANKED_TACTICAL], value: MapsPlaylistType.RANKED_TACTICAL },
            { name: mapPlaylistLabels[MapsPlaylistType.RANKED_DOUBLES], value: MapsPlaylistType.RANKED_DOUBLES },
            { name: mapPlaylistLabels[MapsPlaylistType.RANKED_FFA], value: MapsPlaylistType.RANKED_FFA },
            {
              name: mapPlaylistLabels[MapsPlaylistType.RANKED_SQUAD_BATTLE],
              value: MapsPlaylistType.RANKED_SQUAD_BATTLE,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.String,
          name: "format",
          description: "Format of the map set (default: HCS)",
          required: false,
          choices: [
            { name: mapFormatLabels[MapsFormatType.HCS], value: MapsFormatType.HCS },
            { name: mapFormatLabels[MapsFormatType.RANDOM], value: MapsFormatType.RANDOM },
            { name: mapFormatLabels[MapsFormatType.OBJECTIVE], value: MapsFormatType.OBJECTIVE },
            { name: mapFormatLabels[MapsFormatType.SLAYER], value: MapsFormatType.SLAYER },
          ],
        },
      ],
    },
  ];

  // MapsCommand manually defines its component data (not using handler pattern yet)
  override get data(): CommandData[] {
    return [
      ...this.commands,
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionComponent.Initiate,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionComponent.Roll1,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionComponent.Roll3,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionComponent.Roll5,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionComponent.Roll7,
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: InteractionComponent.PlaylistSelect,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.StringSelect,
          custom_id: InteractionComponent.FormatSelect,
          values: [],
        },
      },
      {
        type: InteractionType.MessageComponent,
        data: {
          component_type: ComponentType.Button,
          custom_id: InteractionComponent.Repost,
        },
      },
    ];
  }

  execute(interaction: BaseInteraction): ExecuteResponse {
    const { type } = interaction;
    try {
      switch (type) {
        case InteractionType.ApplicationCommand: {
          return this.applicationCommandJob(interaction);
        }
        case InteractionType.MessageComponent: {
          return this.messageComponentResponse(interaction as APIMessageComponentButtonInteraction);
        }
        case InteractionType.ModalSubmit: {
          throw new Error("This command cannot be used in this context.");
        }
        default:
          throw new UnreachableError(type);
      }
    } catch (error) {
      this.services.logService.error(error as Error);

      return {
        response: {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: `Error: ${error instanceof Error ? error.message : "unknown"}`,
            flags: MessageFlags.Ephemeral,
          },
        },
      };
    }
  }

  private generateDeferredResponse(
    interaction:
      | APIApplicationCommandInteraction
      | APIMessageComponentButtonInteraction
      | APIMessageComponentSelectMenuInteraction,
    state: { count: number; playlist: MapsPlaylistType; format: MapsFormatType },
    mapsPromise: Promise<{ mode: MapMode; map: string }[]>,
  ): ExecuteResponse {
    return {
      response: {
        type:
          interaction.type === InteractionType.ApplicationCommand
            ? InteractionResponseType.DeferredChannelMessageWithSource
            : InteractionResponseType.DeferredMessageUpdate,
      },
      jobToComplete: async (): Promise<void> => {
        const { discordService, logService } = this.services;
        try {
          const maps = await mapsPromise;
          const availableModes = await this.services.haloService.getMapModesForPlaylist(state.playlist);
          const response = this.createMapsResponse({
            userId: Preconditions.checkExists(
              interaction.member?.user.id ?? interaction.user?.id,
              "expected either an interaction member id or user id but none found",
            ),
            ...state,
            maps,
            availableModes,
          });
          if (
            interaction.type === InteractionType.MessageComponent &&
            interaction.data.custom_id === InteractionComponent.Initiate.toString()
          ) {
            await discordService.createMessage(interaction.channel.id, response);
          } else {
            await discordService.updateDeferredReply(interaction.token, response);
          }
        } catch (error) {
          logService.error(error as Error);
          await discordService.updateDeferredReplyWithError(interaction.token, error);
        }
      },
    };
  }

  private applicationCommandJob(interaction: APIApplicationCommandInteraction): ExecuteResponse {
    if (interaction.data.type !== ApplicationCommandType.ChatInput) {
      throw new Error("This command can only be used as a chat input command.");
    }

    const { options } = interaction.data;

    const countOption = options?.find((opt) => opt.name === "count");
    const count = countOption?.type === ApplicationCommandOptionType.Integer ? countOption.value : 5;

    const playlistOption = options?.find((opt) => opt.name === "playlist");
    const playlist: MapsPlaylistType =
      playlistOption?.type === ApplicationCommandOptionType.String
        ? (playlistOption.value as MapsPlaylistType)
        : MapsPlaylistType.HCS_CURRENT;

    const formatOption = options?.find((opt) => opt.name === "format");
    const format: MapsFormatType =
      formatOption?.type === ApplicationCommandOptionType.String
        ? (formatOption.value as MapsFormatType)
        : MapsFormatType.HCS;

    const state = { count, playlist, format };
    const maps = this.services.haloService.generateMaps(state);

    return this.generateDeferredResponse(interaction, state, maps);
  }

  private messageComponentResponse(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): ExecuteResponse {
    const customId = interaction.data.custom_id as InteractionComponent;

    switch (customId) {
      case InteractionComponent.Initiate: {
        return this.initiateResponse(interaction as APIMessageComponentButtonInteraction);
      }
      case InteractionComponent.Roll1:
      case InteractionComponent.Roll3:
      case InteractionComponent.Roll5:
      case InteractionComponent.Roll7: {
        return this.rollResponse(interaction as APIMessageComponentButtonInteraction, customId);
      }
      case InteractionComponent.PlaylistSelect: {
        return this.playlistSelectResponse(interaction as APIMessageComponentSelectMenuInteraction);
      }
      case InteractionComponent.FormatSelect: {
        return this.formatSelectResponse(interaction as APIMessageComponentSelectMenuInteraction);
      }
      case InteractionComponent.Repost: {
        return this.repostResponse(interaction as APIMessageComponentButtonInteraction);
      }
      default: {
        throw new UnreachableError(customId);
      }
    }
  }

  private initiateResponse(interaction: APIMessageComponentButtonInteraction): ExecuteResponse {
    const count = 5;
    const playlist = MapsPlaylistType.HCS_CURRENT;
    const format = MapsFormatType.HCS;
    const newState = { count, playlist, format };
    const mapsPromise = this.services.haloService.generateMaps(newState);

    return this.generateDeferredResponse(interaction, newState, mapsPromise);
  }

  private rollResponse(
    interaction: APIMessageComponentButtonInteraction,
    customId: InteractionComponent,
  ): ExecuteResponse {
    const state = this.getStateFromEmbed(interaction);
    const count = this.getCountFromInteractionButton(customId);
    const newState = { ...state, count };
    const mapsPromise = this.services.haloService.generateMaps(newState);

    return this.generateDeferredResponse(interaction, newState, mapsPromise);
  }

  private playlistSelectResponse(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    const state = this.getStateFromEmbed(interaction);
    const playlist = interaction.data.values[0] as MapsPlaylistType;
    const newState = { ...state, playlist };
    const mapsPromise = this.services.haloService.generateMaps(newState);

    return this.generateDeferredResponse(interaction, newState, mapsPromise);
  }

  private formatSelectResponse(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    const state = this.getStateFromEmbed(interaction);
    const format = interaction.data.values[0] as MapsFormatType;
    const newState = { ...state, format };
    const mapsPromise = this.services.haloService.generateMaps(newState);

    return this.generateDeferredResponse(interaction, newState, mapsPromise);
  }

  private repostResponse(interaction: APIMessageComponentButtonInteraction): ExecuteResponse {
    return {
      response: {
        type: InteractionResponseType.DeferredMessageUpdate,
      },
      jobToComplete: async (): Promise<void> => {
        await this.services.discordService.createMessage(interaction.channel.id, {
          embeds: interaction.message.embeds,
          components: interaction.message.components,
          content: interaction.message.content,
        });

        await this.services.discordService.deleteMessage(
          interaction.channel.id,
          interaction.message.id,
          "Reposting maps",
        );
      },
    };
  }

  private getCountFromInteractionButton(customId: InteractionComponent): number {
    switch (
      customId as Omit<InteractionComponent, InteractionComponent.Initiate | InteractionComponent.PlaylistSelect>
    ) {
      case InteractionComponent.Roll1: {
        return 1;
      }
      case InteractionComponent.Roll3: {
        return 3;
      }
      case InteractionComponent.Roll5: {
        return 5;
      }
      case InteractionComponent.Roll7: {
        return 7;
      }
      default: {
        throw new Error(`Unknown button interaction: ${customId}`);
      }
    }
  }

  private getStateFromEmbed(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): {
    count: number;
    playlist: MapsPlaylistType;
    format: MapsFormatType;
  } {
    const components =
      interaction.message.components?.flatMap((row) => (row.type === ComponentType.ActionRow ? row.components : [])) ??
      [];

    const primaryRegenButton = Preconditions.checkExists(
      components.find((c) => c.type === ComponentType.Button && c.style === ButtonStyle.Primary),
      "Primary button not found",
    ) as APIButtonComponentWithCustomId;
    const count = this.getCountFromInteractionButton(primaryRegenButton.custom_id as InteractionComponent);
    const playlistSelect = Preconditions.checkExists(
      components.find(
        (c) =>
          c.type === ComponentType.StringSelect &&
          (c.custom_id as InteractionComponent) === InteractionComponent.PlaylistSelect,
      ),
      "Playlist select not found",
    ) as APIStringSelectComponent;
    const playlist = playlistSelect.options.find((opt) => opt.default === true)?.value as MapsPlaylistType;
    const formatSelect = Preconditions.checkExists(
      components.find(
        (c) =>
          c.type === ComponentType.StringSelect &&
          (c.custom_id as InteractionComponent) === InteractionComponent.FormatSelect,
      ),
      "Format select not found",
    ) as APIStringSelectComponent;
    const format = formatSelect.options.find((opt) => opt.default === true)?.value as MapsFormatType;

    return {
      count,
      playlist: Preconditions.checkExists(playlist, "Playlist not found"),
      format: Preconditions.checkExists(format, "Format not found"),
    };
  }

  private createMapsResponse(opts: {
    userId: string;
    count: number;
    playlist: MapsPlaylistType;
    format: MapsFormatType;
    maps: {
      mode: MapMode;
      map: string;
    }[];
    availableModes: MapMode[];
  }): APIInteractionResponseCallbackData {
    const mapsEmbed = new MapsEmbed({ discordService: this.services.discordService }, opts);

    return mapsEmbed.toMessageData();
  }
}
