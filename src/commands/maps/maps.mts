import type {
  APIApplicationCommandInteraction,
  APIButtonComponentWithCustomId,
  APIEmbed,
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
import { type CommandData, type ExecuteResponse, type BaseInteraction, BaseCommand } from "../base/base.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import type { Services } from "../../services/install.mjs";
import { GAMECOACH_GG_URLS } from "./gamecoachgg.mjs";
import type { Format, MapMode } from "./hcs.mjs";
import { CURRENT_HCS_MAPS, HISTORICAL_HCS_MAPS, ALL_MODES, HCS_SET_FORMAT } from "./hcs.mjs";
import type { generateRoundRobinMapsFn } from "./round-robin.mjs";
import { generateRoundRobinMaps } from "./round-robin.mjs";

type CountType = 1 | 3 | 5 | 7;

export enum PlaylistType {
  HcsCurrent = "HCS - current",
  HcsHistorical = "HCS - historical",
}

export enum FormatType {
  Hcs = "HCS (obj slayer obj obj slayer...)",
  Random = "Random",
  RandomObjective = "Random Objective only",
  RandomSlayer = "Random Slayer only",
}

export enum InteractionComponent {
  Initiate = "btn_maps_initiate",
  Roll1 = "btn_maps_roll_1",
  Roll3 = "btn_maps_roll_3",
  Roll5 = "btn_maps_roll_5",
  Roll7 = "btn_maps_roll_7",
  PlaylistSelect = "select_maps_playlist",
  FormatSelect = "select_maps_format",
  Repost = "btn_maps_repost",
}

export class MapsCommand extends BaseCommand {
  private readonly roundRobinFn: generateRoundRobinMapsFn;

  constructor(services: Services, env: Env, roundRobinFn: generateRoundRobinMapsFn = generateRoundRobinMaps) {
    super(services, env);
    this.roundRobinFn = roundRobinFn;
  }

  public getMapModeFormat(format: FormatType, count: CountType): Format[] {
    switch (format) {
      case FormatType.Hcs: {
        return Preconditions.checkExists(HCS_SET_FORMAT[count]);
      }
      case FormatType.Random: {
        return Array(count).fill("random") as Format[];
      }
      case FormatType.RandomObjective: {
        return Array(count).fill("objective") as Format[];
      }
      case FormatType.RandomSlayer: {
        return Array(count).fill("slayer") as Format[];
      }
      default: {
        throw new UnreachableError(format);
      }
    }
  }

  public generateMaps({
    count,
    playlist,
    format,
  }: {
    count: CountType;
    playlist: PlaylistType;
    format: FormatType;
  }): { mode: MapMode; map: string }[] {
    const mapSet: Record<MapMode, string[]> =
      playlist === PlaylistType.HcsHistorical ? HISTORICAL_HCS_MAPS : CURRENT_HCS_MAPS;

    const formatSequence = this.getMapModeFormat(format, count);

    // Build all possible (mode, map) pairs
    const allPairs: { mode: MapMode; map: string }[] = [];
    for (const mode of ALL_MODES) {
      for (const map of mapSet[mode]) {
        allPairs.push({ mode, map });
      }
    }

    return this.roundRobinFn({
      count,
      pool: allPairs,
      formatSequence: formatSequence.map((f: Format) =>
        f === "random" ? (Math.random() < 1 / 6 ? "slayer" : "objective") : f,
      ),
    });
  }

  readonly data: CommandData[] = [
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
            { name: PlaylistType.HcsCurrent, value: PlaylistType.HcsCurrent },
            {
              name: `${PlaylistType.HcsHistorical} (all maps + modes played in any HCS major)`,
              value: PlaylistType.HcsHistorical,
            },
          ],
        },
        {
          type: ApplicationCommandOptionType.String,
          name: "format",
          description: "Format of the map set (default: HCS)",
          required: false,
          choices: [
            { name: FormatType.Hcs, value: FormatType.Hcs },
            { name: FormatType.Random, value: FormatType.Random },
            { name: FormatType.RandomObjective, value: FormatType.RandomObjective },
            { name: FormatType.RandomSlayer, value: FormatType.RandomSlayer },
          ],
        },
      ],
    },
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

  private applicationCommandJob(interaction: APIApplicationCommandInteraction): ExecuteResponse {
    if (interaction.data.type !== ApplicationCommandType.ChatInput) {
      throw new Error("This command can only be used as a chat input command.");
    }

    const { options } = interaction.data;

    const countOption = options?.find((opt) => opt.name === "count");
    const count = countOption?.type === ApplicationCommandOptionType.Integer ? (countOption.value as CountType) : 5;

    const playlistOption = options?.find((opt) => opt.name === "playlist");
    const playlist: PlaylistType =
      playlistOption?.type === ApplicationCommandOptionType.String
        ? (playlistOption.value as PlaylistType)
        : PlaylistType.HcsCurrent;

    const formatOption = options?.find((opt) => opt.name === "format");
    const format: FormatType =
      formatOption?.type === ApplicationCommandOptionType.String ? (formatOption.value as FormatType) : FormatType.Hcs;

    const state = { count, playlist, format };
    const maps = this.generateMaps(state);

    return {
      response: {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: this.createMapsResponse({ interaction, ...state, maps }),
      },
    };
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
    const playlist = PlaylistType.HcsCurrent;
    const format = FormatType.Hcs;
    const maps = this.generateMaps({ count, playlist, format });

    return {
      response: {
        type: InteractionResponseType.DeferredMessageUpdate,
      },
      jobToComplete: async (): Promise<void> => {
        await this.services.discordService.createMessage(
          interaction.channel.id,
          this.createMapsResponse({ interaction, count, playlist, format, maps }),
        );
      },
    };
  }

  private rollResponse(
    interaction: APIMessageComponentButtonInteraction,
    customId: InteractionComponent,
  ): ExecuteResponse {
    const state = this.getStateFromEmbed(interaction);
    const count = this.getCountFromInteractionButton(customId);
    const maps = this.generateMaps({ ...state, count });

    return {
      response: {
        type: InteractionResponseType.UpdateMessage,
        data: this.createMapsResponse({ interaction, ...state, count, maps }),
      },
    };
  }

  private playlistSelectResponse(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    const state = this.getStateFromEmbed(interaction);
    const playlist = interaction.data.values[0] as PlaylistType;

    const maps = this.generateMaps({ ...state, playlist });

    return {
      response: {
        type: InteractionResponseType.UpdateMessage,
        data: this.createMapsResponse({ interaction, ...state, playlist, maps }),
      },
    };
  }

  private formatSelectResponse(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    const state = this.getStateFromEmbed(interaction);
    const format = interaction.data.values[0] as FormatType;

    const maps = this.generateMaps({ ...state, format });

    return {
      response: {
        type: InteractionResponseType.UpdateMessage,
        data: this.createMapsResponse({ interaction, ...state, format, maps }),
      },
    };
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

  private getCountFromInteractionButton(customId: InteractionComponent): CountType {
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
    count: CountType;
    playlist: PlaylistType;
    format: FormatType;
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
    const playlist = playlistSelect.options.find((opt) => opt.default === true)?.value as PlaylistType;
    const formatSelect = Preconditions.checkExists(
      components.find(
        (c) =>
          c.type === ComponentType.StringSelect &&
          (c.custom_id as InteractionComponent) === InteractionComponent.FormatSelect,
      ),
      "Format select not found",
    ) as APIStringSelectComponent;
    const format = formatSelect.options.find((opt) => opt.default === true)?.value as FormatType;

    return {
      count,
      playlist: Preconditions.checkExists(playlist, "Playlist not found"),
      format: Preconditions.checkExists(format, "Format not found"),
    };
  }

  private createMapsResponse({
    interaction,
    count,
    playlist,
    format,
    maps,
  }: {
    interaction:
      | APIApplicationCommandInteraction
      | APIMessageComponentButtonInteraction
      | APIMessageComponentSelectMenuInteraction;
    count: CountType;
    playlist: PlaylistType;
    format: FormatType;
    maps: {
      mode: MapMode;
      map: string;
    }[];
  }): APIInteractionResponseCallbackData {
    const titles = ["#", "Mode", "Map"];
    const tableData = [titles];
    for (const [index, { mode, map }] of maps.entries()) {
      const gamecoachGgUrl = GAMECOACH_GG_URLS[map];
      const mapString =
        gamecoachGgUrl != null
          ? `[${map} ${this.services.discordService.getEmojiFromName("GameCoachGG")}](${gamecoachGgUrl})`
          : map;
      tableData.push([String(index + 1), mode, mapString]);
    }

    const embed: APIEmbed = {
      title: `Maps: ${playlist}`,
      color: 0x5865f2,
      fields: [],
    };
    this.addEmbedFields(embed, titles, tableData);

    if (interaction.member?.user.id != null) {
      embed.fields?.push({
        name: "",
        value: `-# Generated by <@${interaction.member.user.id}>`,
      });
    }

    return {
      embeds: [embed],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              custom_id: InteractionComponent.Roll1,
              label: "Regen maps (count: 1)",
              style: count === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary,
            },
            {
              type: ComponentType.Button,
              custom_id: InteractionComponent.Roll3,
              label: "Regen maps (count: 3)",
              style: count === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary,
            },
            {
              type: ComponentType.Button,
              custom_id: InteractionComponent.Roll5,
              label: "Regen maps (count: 5)",
              style: count === 5 ? ButtonStyle.Primary : ButtonStyle.Secondary,
            },
            {
              type: ComponentType.Button,
              custom_id: InteractionComponent.Roll7,
              label: "Regen maps (count: 7)",
              style: count === 7 ? ButtonStyle.Primary : ButtonStyle.Secondary,
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: InteractionComponent.PlaylistSelect,
              options: [
                {
                  label: PlaylistType.HcsCurrent,
                  value: PlaylistType.HcsCurrent,
                  default: playlist === PlaylistType.HcsCurrent,
                },
                {
                  label: `${PlaylistType.HcsHistorical} (all maps + modes played in any HCS major)`,
                  value: PlaylistType.HcsHistorical,
                  default: playlist === PlaylistType.HcsHistorical,
                },
              ],
              placeholder: "Select a playlist",
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: InteractionComponent.FormatSelect,
              options: [
                {
                  label: FormatType.Hcs,
                  value: FormatType.Hcs,
                  default: format === FormatType.Hcs,
                },
                {
                  label: FormatType.Random,
                  value: FormatType.Random,
                  default: format === FormatType.Random,
                },
                {
                  label: FormatType.RandomObjective,
                  value: FormatType.RandomObjective,
                  default: format === FormatType.RandomObjective,
                },
                {
                  label: FormatType.RandomSlayer,
                  value: FormatType.RandomSlayer,
                  default: format === FormatType.RandomSlayer,
                },
              ],
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              custom_id: InteractionComponent.Repost,
              label: "Move to bottom of chat",
              style: ButtonStyle.Secondary,
              emoji: {
                name: "⏬",
              },
            },
          ],
        },
      ],
    };
  }

  private addEmbedFields(embed: APIEmbed, titles: string[], data: string[][]): void {
    for (let column = 0; column < titles.length; column++) {
      embed.fields ??= [];
      embed.fields.push({
        name: Preconditions.checkExists(titles[column]),
        value: data
          .slice(1)
          .map((row) => row[column])
          .join("\n"),
        inline: true,
      });
    }
  }
}
