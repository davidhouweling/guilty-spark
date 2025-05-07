import type {
  APIModalInteractionResponse,
  APIActionRowComponent,
  APIEmbedField,
  APIComponentInMessageActionRow,
  APIMessageComponentButtonInteraction,
  APIMessageComponentInteraction,
  APIMessageComponentSelectMenuInteraction,
  APIModalSubmitInteraction,
  RESTPostAPIWebhookWithTokenJSONBody,
  APIInteractionResponse,
  APISelectMenuOption,
  APIEmbed,
  APIButtonComponentWithCustomId,
  APISelectMenuComponent,
} from "discord-api-types/v10";
import {
  InteractionContextType,
  ApplicationCommandType,
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  TextInputStyle,
  ChannelType,
} from "discord-api-types/v10";
import type { BaseInteraction, CommandData, ExecuteResponse } from "../base/base.mjs";
import { BaseCommand } from "../base/base.mjs";
import { StatsReturnType } from "../../services/database/types/guild_config.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { escapeRegExp } from "../../base/regex.mjs";
import type { NeatQueueConfigRow } from "../../services/database/types/neat_queue_config.mjs";
import { NeatQueuePostSeriesDisplayMode } from "../../services/database/types/neat_queue_config.mjs";

enum SetupSelectOption {
  StatsDisplayMode = "stats_display_mode",
  NeatQueueIntegration = "neatqueue_integration",
}

enum SetupStatsDisplayModeOption {
  SeriesOnly = "series_only",
  SeriesAndGames = "series_games",
}

export enum InteractionComponent {
  SetupSelect = "setup_select",
  MainMenu = "setup_main_menu",
  SetupStatsDisplayMode = "setup_stats_display_mode",
  NeatQueueIntegrationAdd = "setup_neat_queue_add",
  NeatQueueIntegrationAddWizardBack = "setup_neat_queue_add_wizard_back",
  NeatQueueIntegrationAddWizardNext = "setup_neat_queue_add_wizard_next",
  NeatQueueIntegrationAddWizardSave = "setup_neat_queue_add_wizard_save",
  NeatQueueIntegrationAddEditCancel = "setup_neat_queue_add_edit_cancel",
  NeatQueueIntegrationEdit = "setup_neat_queue_edit",
  NeatQueueIntegrationEditChannel = "setup_neat_queue_edit_channel",
  NeatQueueIntegrationEditChannelOptionSelect = "setup_neat_queue_edit_channel_option_select",
  NeatQueueIntegrationEditChannelWebhookSecret = "setup_neat_queue_edit_webhook_secret",
  NeatQueueIntegrationEditChannelWebhookSecretInput = "setup_neat_queue_edit_webhook_secret_input",
  NeatQueueIntegrationEditChannelResultsChannel = "setup_neat_queue_edit_results_channel",
  NeatQueueIntegrationEditChannelDisplayMode = "setup_neat_queue_edit_display_mode",
  NeatQueueIntegrationEditChannelResultsPostChannel = "setup_neat_queue_edit_results_post_channel",
  NeatQueueIntegrationEditChannelDelete = "setup_neat_queue_edit_delete",
  NeatQueueIntegrationEditChannelBack = "setup_neat_queue_edit_channel_back",
}

const displayModeOptions = [
  { label: "Threaded message of the results", value: "T" },
  { label: "New message in results channel", value: "M" },
  { label: "New message in different channel", value: "C" },
];

enum NeatQueueIntegrationWizardStepKey {
  WebhookSecret = "webhook_secret",
  QueueChannel = "queue_channel",
  HasResultsChannel = "has_results_channel",
  ResultsChannel = "results_channel",
  DisplayMode = "display_mode",
  ResultsPostChannel = "results_post_channel",
  Complete = "complete",
  Delete = "delete",
}
type NeatQueueIntegrationWizardStep = {
  key: NeatQueueIntegrationWizardStepKey;
  question: string;
  predicate?: (form: Map<NeatQueueIntegrationWizardStepKey, string>) => boolean;
} & (
  | {
      input: APIModalInteractionResponse;
      cta: string;
    }
  | {
      input: APIComponentInMessageActionRow;
      cta?: never;
    }
) &
  (
    | { format: (value: string) => string; extract: (value: string) => string }
    | {
        format?: never;
        extract?: never;
      }
  );

const NeatQueueIntegrationWizardSteps: NeatQueueIntegrationWizardStep[] = [
  {
    key: NeatQueueIntegrationWizardStepKey.WebhookSecret,
    question: "What is the webhook secret?",
    cta: "🔐 Enter webhook secret",
    format: (value) => `\`${value}\``,
    extract: (value) => value.substring(1, value.length - 1),
    input: {
      type: InteractionResponseType.Modal,
      data: {
        title: "Webhook Secret Entry",
        custom_id: InteractionComponent.NeatQueueIntegrationAddWizardNext,
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.TextInput,
                custom_id: NeatQueueIntegrationWizardStepKey.WebhookSecret,
                label: "Webhook Secret",
                style: TextInputStyle.Short,
                required: true,
                min_length: 16,
                max_length: 16,
              },
            ],
          },
        ],
      },
    },
  },
  {
    key: NeatQueueIntegrationWizardStepKey.QueueChannel,
    question: "What channel is the queue in?",
    format: (value) => `<#${value}>`,
    extract: (value) => value.substring(2, value.length - 1),
    input: {
      type: ComponentType.ChannelSelect,
      custom_id: InteractionComponent.NeatQueueIntegrationAddWizardNext,
      channel_types: [ChannelType.GuildText],
      min_values: 1,
      max_values: 1,
      placeholder: "Select the queue channel",
    },
  },
  {
    key: NeatQueueIntegrationWizardStepKey.HasResultsChannel,
    question: "Is the results channel different to the queue channel?",
    input: {
      type: ComponentType.StringSelect,
      custom_id: InteractionComponent.NeatQueueIntegrationAddWizardNext,
      options: [
        {
          label: "Yes",
          value: "Yes",
        },
        {
          label: "No",
          value: "No",
        },
      ],
      min_values: 1,
      max_values: 1,
    },
  },
  {
    key: NeatQueueIntegrationWizardStepKey.ResultsChannel,
    question: "What channel does NeatQueue put the results in?",
    format: (value) => `<#${value}>`,
    extract: (value) => value.substring(2, value.length - 1),
    input: {
      type: ComponentType.ChannelSelect,
      custom_id: InteractionComponent.NeatQueueIntegrationAddWizardNext,
      channel_types: [ChannelType.GuildText],
      min_values: 1,
      max_values: 1,
      placeholder: "Select the results channel",
    },
    predicate: (form) => form.get(NeatQueueIntegrationWizardStepKey.HasResultsChannel) === "Yes",
  },
  {
    key: NeatQueueIntegrationWizardStepKey.DisplayMode,
    question: "How would you like to display the results?",
    format: (value): string => {
      return Preconditions.checkExists(
        displayModeOptions.find((option) => option.value === value),
        "Format display mode not found",
      ).label;
    },
    extract: (value): string => {
      return Preconditions.checkExists(
        displayModeOptions.find((option) => option.label === value),
        "Extract display mode not found",
      ).value;
    },
    input: {
      type: ComponentType.StringSelect,
      custom_id: InteractionComponent.NeatQueueIntegrationAddWizardNext,
      min_values: 1,
      max_values: 1,
      options: displayModeOptions,
    },
  },
  {
    key: NeatQueueIntegrationWizardStepKey.ResultsPostChannel,
    question: "Which channel should the results be posted in?",
    format: (value) => `<#${value}>`,
    extract: (value) => value.substring(2, value.length - 1),
    input: {
      type: ComponentType.ChannelSelect,
      custom_id: InteractionComponent.NeatQueueIntegrationAddWizardNext,
      channel_types: [ChannelType.GuildText],
      min_values: 1,
      max_values: 1,
      placeholder: "Select the results post channel",
    },
    predicate: (form) => form.get(NeatQueueIntegrationWizardStepKey.DisplayMode) === "C",
  },
  {
    key: NeatQueueIntegrationWizardStepKey.Complete,
    question: "End of the questions! Please confirm the details above.",
    input: {
      type: ComponentType.Button,
      custom_id: InteractionComponent.NeatQueueIntegrationAddWizardSave,
      label: "Yep all good, save it!",
      style: ButtonStyle.Primary,
      emoji: { name: "✅" },
    },
  },
];

const ActionButtons = new Map<InteractionComponent, APIButtonComponentWithCustomId>([
  [
    InteractionComponent.NeatQueueIntegrationAdd,
    {
      type: ComponentType.Button,
      custom_id: InteractionComponent.NeatQueueIntegrationAdd,
      label: "Add NeatQueue integration",
      style: ButtonStyle.Primary,
      emoji: { name: "➕" },
    },
  ],
  [
    InteractionComponent.NeatQueueIntegrationAddWizardBack,
    {
      type: ComponentType.Button,
      custom_id: InteractionComponent.NeatQueueIntegrationAddWizardBack,
      label: "Back",
      style: ButtonStyle.Secondary,
      emoji: { name: "🔙" },
    },
  ],
  [
    InteractionComponent.NeatQueueIntegrationAddEditCancel,
    {
      type: ComponentType.Button,
      custom_id: InteractionComponent.NeatQueueIntegrationAddEditCancel,
      label: "Back",
      style: ButtonStyle.Secondary,
      emoji: { name: "🔙" },
    },
  ],
  [
    InteractionComponent.NeatQueueIntegrationEdit,
    {
      type: ComponentType.Button,
      custom_id: InteractionComponent.NeatQueueIntegrationEdit,
      label: "Edit existing NeatQueue integration",
      style: ButtonStyle.Secondary,
      emoji: { name: "🛠️" },
    },
  ],
  [
    InteractionComponent.NeatQueueIntegrationEditChannelWebhookSecret,
    {
      type: ComponentType.Button,
      custom_id: InteractionComponent.NeatQueueIntegrationEditChannelWebhookSecret,
      label: "Edit webhook secret",
      style: ButtonStyle.Primary,
      emoji: { name: "🔐" },
    },
  ],
  [
    InteractionComponent.NeatQueueIntegrationEditChannelDelete,
    {
      type: ComponentType.Button,
      custom_id: InteractionComponent.NeatQueueIntegrationEditChannelDelete,
      label: "Confirm delete",
      style: ButtonStyle.Danger,
      emoji: { name: "🗑️" },
    },
  ],
  [
    InteractionComponent.NeatQueueIntegrationEditChannelBack,
    {
      type: ComponentType.Button,
      custom_id: InteractionComponent.NeatQueueIntegrationEditChannelBack,
      label: "Back",
      style: ButtonStyle.Secondary,
      emoji: { name: "🔙" },
    },
  ],
  [
    InteractionComponent.MainMenu,
    {
      type: ComponentType.Button,
      custom_id: InteractionComponent.MainMenu,
      label: "Back to Main Menu",
      style: ButtonStyle.Secondary,
      emoji: { name: "🎛️" },
    },
  ],
]);

export class SetupCommand extends BaseCommand {
  readonly data: CommandData[] = [
    {
      type: ApplicationCommandType.ChatInput,
      name: "setup",
      description: "Setup Guilty Spark for your server",
      contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
      default_member_permissions: (1 << 5).toString(),
      options: [],
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.StringSelect,
        custom_id: InteractionComponent.SetupSelect,
        values: [],
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.StringSelect,
        custom_id: InteractionComponent.SetupStatsDisplayMode,
        values: [],
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueIntegrationAdd,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueIntegrationAddWizardBack,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueIntegrationAddWizardNext,
      },
    },
    {
      type: InteractionType.ModalSubmit,
      data: {
        components: [],
        custom_id: InteractionComponent.NeatQueueIntegrationAddWizardNext,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueIntegrationAddWizardSave,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueIntegrationAddEditCancel,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueIntegrationEdit,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.StringSelect,
        custom_id: InteractionComponent.NeatQueueIntegrationEditChannel,
        values: [],
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.StringSelect,
        custom_id: InteractionComponent.NeatQueueIntegrationEditChannelOptionSelect,
        values: [],
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueIntegrationEditChannelWebhookSecret,
      },
    },
    {
      type: InteractionType.ModalSubmit,
      data: {
        components: [],
        custom_id: InteractionComponent.NeatQueueIntegrationEditChannelWebhookSecretInput,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.ChannelSelect,
        custom_id: InteractionComponent.NeatQueueIntegrationEditChannelResultsChannel,
        values: [],
        resolved: {
          channels: {},
        },
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.StringSelect,
        custom_id: InteractionComponent.NeatQueueIntegrationEditChannelDisplayMode,
        values: [],
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.ChannelSelect,
        custom_id: InteractionComponent.NeatQueueIntegrationEditChannelResultsPostChannel,
        values: [],
        resolved: {
          channels: {},
        },
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueIntegrationEditChannelDelete,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueIntegrationEditChannelBack,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.MainMenu,
      },
    },
  ];

  readonly webhookSecretInstructions = [
    `1. Copy this URL: \n\`${this.env.HOST_URL}/neatqueue\``,
    "2. Switch to the queue channel if you are not already there",
    "3. Use NeatQueue's `/webhook add` command and paste in the url",
    "4. NeatQueue will reply with a webhook secret, copy it",
  ];

  override execute(interaction: BaseInteraction): ExecuteResponse {
    const { type, guild_id: guildId } = interaction;

    if (guildId == null) {
      return {
        response: {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: "This command can only be used in a server!",
            flags: MessageFlags.Ephemeral,
          },
        },
      };
    }

    try {
      switch (type) {
        case InteractionType.ApplicationCommand: {
          return {
            response: {
              type: InteractionResponseType.DeferredChannelMessageWithSource,
              data: { flags: MessageFlags.Ephemeral },
            },
            jobToComplete: async () => this.applicationCommandJob(interaction),
          };
        }
        case InteractionType.MessageComponent: {
          return this.messageComponentResponse(interaction);
        }
        case InteractionType.ModalSubmit: {
          const { custom_id: customId } = interaction.data;
          if (customId === InteractionComponent.NeatQueueIntegrationAddWizardNext.toString()) {
            return this.neatQueueIntegrationAddWizardNext(interaction);
          }

          if (customId === InteractionComponent.NeatQueueIntegrationEditChannelWebhookSecretInput.toString()) {
            return {
              response: {
                type: InteractionResponseType.DeferredMessageUpdate,
              },
              jobToComplete: async () => this.setupNeatQueueIntegrationEditChannelWebhookSecretJob(interaction),
            };
          }

          throw new Error("Unexpected modal submit interaction");
        }
        default: {
          throw new UnreachableError(type);
        }
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

  messageComponentResponse(
    interaction:
      | APIMessageComponentButtonInteraction
      | APIMessageComponentSelectMenuInteraction
      | APIModalSubmitInteraction,
  ): ExecuteResponse {
    const { custom_id } = interaction.data;
    const customId = custom_id as InteractionComponent;

    switch (customId) {
      case InteractionComponent.SetupSelect: {
        return this.setupSelectResponse(interaction as APIMessageComponentSelectMenuInteraction);
      }
      case InteractionComponent.SetupStatsDisplayMode: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () =>
            this.updateSelectStatsDisplayModeJob(interaction as APIMessageComponentSelectMenuInteraction),
        };
      }
      case InteractionComponent.NeatQueueIntegrationAdd: {
        return this.neatQueueIntegrationAddWizardNext(null);
      }
      case InteractionComponent.NeatQueueIntegrationAddWizardBack: {
        return this.neatQueueIntegrationAddWizardBack(interaction as APIMessageComponentButtonInteraction);
      }
      case InteractionComponent.NeatQueueIntegrationAddWizardNext: {
        return this.neatQueueIntegrationAddWizardNext(interaction);
      }
      case InteractionComponent.NeatQueueIntegrationAddWizardSave: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () =>
            this.setupSelectNeatQueueIntegrationSaveJob(interaction as APIMessageComponentButtonInteraction),
        };
      }
      case InteractionComponent.NeatQueueIntegrationAddEditCancel: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () => this.setupSelectNeatQueueIntegrationJob(interaction),
        };
      }
      case InteractionComponent.NeatQueueIntegrationEdit: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () =>
            this.setupNeatQueueIntegrationEditJob(interaction as APIMessageComponentButtonInteraction),
        };
      }
      case InteractionComponent.NeatQueueIntegrationEditChannel: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () =>
            this.setupNeatQueueIntegrationEditChannelJobFromSelectMenu(
              interaction as APIMessageComponentSelectMenuInteraction,
            ),
        };
      }
      case InteractionComponent.NeatQueueIntegrationEditChannelOptionSelect: {
        return this.setupNeatQueueIntegrationEditChannelOptionSelect(
          interaction as APIMessageComponentSelectMenuInteraction,
        );
      }
      case InteractionComponent.NeatQueueIntegrationEditChannelWebhookSecret: {
        const response = Preconditions.checkExists(
          NeatQueueIntegrationWizardSteps.find((step) => step.key === NeatQueueIntegrationWizardStepKey.WebhookSecret),
        ).input as APIModalInteractionResponse;

        return {
          response: {
            ...response,
            data: {
              ...response.data,
              custom_id: InteractionComponent.NeatQueueIntegrationEditChannelWebhookSecretInput,
            },
          },
        };
      }
      case InteractionComponent.NeatQueueIntegrationEditChannelWebhookSecretInput: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () =>
            this.setupNeatQueueIntegrationEditChannelWebhookSecretJob(interaction as APIModalSubmitInteraction),
        };
      }
      case InteractionComponent.NeatQueueIntegrationEditChannelResultsChannel: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () =>
            this.setupNeatQueueIntegrationEditChannelResultsChannelJob(
              interaction as APIMessageComponentSelectMenuInteraction,
            ),
        };
      }
      case InteractionComponent.NeatQueueIntegrationEditChannelDisplayMode: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () =>
            this.setupNeatQueueIntegrationEditChannelDisplayModeJob(
              interaction as APIMessageComponentSelectMenuInteraction,
            ),
        };
      }
      case InteractionComponent.NeatQueueIntegrationEditChannelResultsPostChannel: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () =>
            this.setupNeatQueueIntegrationEditChannelResultsPostChannelJob(
              interaction as APIMessageComponentSelectMenuInteraction,
            ),
        };
      }
      case InteractionComponent.NeatQueueIntegrationEditChannelBack: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () =>
            this.setupNeatQueueIntegrationEditChannelBackJob(interaction as APIMessageComponentButtonInteraction),
        };
      }
      case InteractionComponent.NeatQueueIntegrationEditChannelDelete: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () =>
            this.setupNeatQueueIntegrationEditChannelDeleteJob(interaction as APIMessageComponentButtonInteraction),
        };
      }
      case InteractionComponent.MainMenu: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () => this.applicationCommandJob(interaction),
        };
      }
      default: {
        throw new UnreachableError(customId);
      }
    }
  }

  private getActionButton(key: InteractionComponent): APIButtonComponentWithCustomId {
    return Preconditions.checkExists(ActionButtons.get(key), `Button not found for key: ${key}`);
  }

  private async applicationCommandJob(interaction: BaseInteraction): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild_id);

    try {
      const [config, neatQueues] = await Promise.all([
        databaseService.getGuildConfig(guildId, true),
        databaseService.findNeatQueueConfig({ GuildId: guildId }),
      ]);
      const statsDisplays = [
        config.StatsReturn === StatsReturnType.SERIES_ONLY ? "Series Stats Only" : "Series + All Game Stats",
        config.Medals === "Y" ? "Medals" : "No Medals",
      ];

      const neatQueueIntegrationsCount =
        neatQueues.length > 0
          ? `${neatQueues.length.toLocaleString()} queue${neatQueues.length > 1 ? "s" : ""}`
          : "*None*";
      const configDisplay = [
        `**Stats Display Mode:** ${statsDisplays.join(", ")}`,
        `**NeatQueue Integrations:** ${neatQueueIntegrationsCount}`,
      ].join("\n");

      const content: RESTPostAPIWebhookWithTokenJSONBody = {
        embeds: [
          {
            title: "Server Configuration",
            description: "Current configuration for your server:",
            fields: [
              {
                name: "",
                value: configDisplay,
              },
            ],
          },
        ],
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: InteractionComponent.SetupSelect,
                options: [
                  {
                    label: "Configure Stats Display Mode",
                    value: SetupSelectOption.StatsDisplayMode,
                    description: "Change the way stats are displayed in the server",
                  },
                  {
                    label: "Configure NeatQueue Integration",
                    value: SetupSelectOption.NeatQueueIntegration,
                    description: "Configure the NeatQueue integration for your server",
                  },
                ],
                placeholder: "Select an option to configure",
              },
            ],
          },
        ],
      };

      await discordService.updateDeferredReply(interaction.token, content);
    } catch (error) {
      this.services.logService.error(error as Error);

      await discordService.updateDeferredReply(interaction.token, {
        content: `Failed to fetch configuration: ${error instanceof Error ? error.message : "unknown"}`,
      });
    }
  }

  private setupSelectResponse(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    switch (interaction.data.values[0]) {
      case SetupSelectOption.StatsDisplayMode: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () => this.setupSelectStatsDisplayModeJob(interaction),
        };
      }
      case SetupSelectOption.NeatQueueIntegration: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () => this.setupSelectNeatQueueIntegrationJob(interaction),
        };
      }
      case undefined:
      default: {
        return {
          response: {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: "Unknown option selected",
              flags: MessageFlags.Ephemeral,
            },
          },
        };
      }
    }
  }

  private async setupSelectStatsDisplayModeJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild_id);

    try {
      const config = await databaseService.getGuildConfig(guildId, true);

      const content: RESTPostAPIWebhookWithTokenJSONBody = {
        content: "",
        embeds: [
          {
            title: "Stats Display Mode",
            description:
              "How stats are displayed when either the `/stats` command is used, or when automatically posting stats for NeatQueue.",
          },
        ],
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: InteractionComponent.SetupStatsDisplayMode,
                options: [
                  {
                    label: "Series Stats Only",
                    value: SetupStatsDisplayModeOption.SeriesOnly,
                    description: "Only display stats for series. Button available to view all game stats.",
                    default: config.StatsReturn === StatsReturnType.SERIES_ONLY,
                  },
                  {
                    label: "Series + All Game Stats",
                    value: SetupStatsDisplayModeOption.SeriesAndGames,
                    description: "Display stats for series and all games played automatically.",
                    default: config.StatsReturn === StatsReturnType.SERIES_AND_GAMES,
                  },
                ],
                placeholder: "Select an option",
              },
            ],
          },
        ],
      };

      await discordService.updateDeferredReply(interaction.token, content);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async updateSelectStatsDisplayModeJob(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { databaseService, discordService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild_id);
    const value = Preconditions.checkExists(interaction.data.values[0]);

    try {
      const config = await databaseService.getGuildConfig(guildId, true);

      config.StatsReturn =
        value === SetupStatsDisplayModeOption.SeriesOnly.toString()
          ? StatsReturnType.SERIES_ONLY
          : StatsReturnType.SERIES_AND_GAMES;

      await databaseService.updateGuildConfig(guildId, config);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async setupSelectNeatQueueIntegrationJob(
    interaction: APIMessageComponentInteraction | APIModalSubmitInteraction,
  ): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild_id);
    const neatQueues = await databaseService.findNeatQueueConfig({ GuildId: guildId });

    const description = [
      "By configuring the NeatQueue integration, I can do things in an automated way, including:",
      "- Post series stats automatically after a series is completed",
    ].join("\n");

    const addButton = this.getActionButton(InteractionComponent.NeatQueueIntegrationAdd);
    const fields: APIEmbedField[] = [
      {
        name: "Adding a NeatQueue Integration",
        value: [
          ...this.webhookSecretInstructions,
          `5. Click the "${addButton.emoji?.name ?? ""} ${addButton.label ?? ""}" button below`,
          "6. Follow the prompts to provide me with the webhook secret and configure how you want the stats to be displayed",
        ].join("\n"),
      },
    ];

    const actions: APIComponentInMessageActionRow[] = [addButton];

    if (neatQueues.length > 0) {
      fields.push({
        name: "Existing NeatQueue Integrations",
        value: neatQueues
          .map(
            (neatQueue) =>
              `- <#${neatQueue.ChannelId}> (results: <#${neatQueue.ResultsChannelId}>): ${displayModeOptions.find((mode) => mode.value === neatQueue.PostSeriesMode.toString())?.label ?? "Unknown"}${neatQueue.PostSeriesChannelId != null ? ` into <#${neatQueue.PostSeriesChannelId}>` : ""}`,
          )
          .join("\n"),
      });

      actions.push(this.getActionButton(InteractionComponent.NeatQueueIntegrationEdit));
    }

    const content: RESTPostAPIWebhookWithTokenJSONBody = {
      content: "",
      embeds: [
        {
          title: "NeatQueue Integration",
          description,
          fields,
        },
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: actions,
        },
        {
          type: ComponentType.ActionRow,
          components: [this.getActionButton(InteractionComponent.MainMenu)],
        },
      ],
    };

    await discordService.updateDeferredReply(interaction.token, content);
  }

  private neatQueueIntegrationAddWizardBack(interaction: APIMessageComponentButtonInteraction): ExecuteResponse {
    const formData = this.wizardGetFormData(interaction);
    const lastEntry = Array.from(formData.keys()).pop();

    if (lastEntry == null) {
      throw new Error("No last entry found in form data");
    }
    formData.delete(lastEntry);

    return this.wizardGetResponse(formData);
  }

  private neatQueueIntegrationAddWizardNext(
    interaction:
      | APIMessageComponentButtonInteraction
      | APIMessageComponentSelectMenuInteraction
      | APIModalSubmitInteraction
      | null,
  ): ExecuteResponse {
    const formData = this.wizardGetFormData(interaction);

    const maybeResponse = this.wizardProcessInteraction(interaction, formData);
    if (maybeResponse) {
      return { response: maybeResponse };
    }

    return this.wizardGetResponse(formData);
  }

  private wizardGetFormData(
    interaction:
      | APIMessageComponentButtonInteraction
      | APIMessageComponentSelectMenuInteraction
      | APIModalSubmitInteraction
      | null,
  ): Map<NeatQueueIntegrationWizardStepKey, string> {
    const formData = new Map<NeatQueueIntegrationWizardStepKey, string>();

    if (interaction == null) {
      return formData;
    }

    const description = interaction.message?.embeds[0]?.description ?? "";

    for (const step of NeatQueueIntegrationWizardSteps) {
      const regex = new RegExp(`${escapeRegExp(step.question)}: (.*)`);
      const match = description.match(regex);

      if (match?.[1] != null) {
        const value = step.extract ? step.extract(match[1].trim()) : match[1].trim();
        formData.set(step.key, value);
      }
    }

    return formData;
  }

  private wizardProcessInteraction(
    interaction:
      | APIMessageComponentButtonInteraction
      | APIMessageComponentSelectMenuInteraction
      | APIModalSubmitInteraction
      | null,
    formData: Map<NeatQueueIntegrationWizardStepKey, string>,
  ): APIInteractionResponse | undefined {
    if (interaction == null) {
      return undefined;
    }

    if (interaction.type === InteractionType.ModalSubmit) {
      const { custom_id, value } = Preconditions.checkExists(interaction.data.components[0]?.components[0]);
      formData.set(custom_id as NeatQueueIntegrationWizardStepKey, value);
      return undefined;
    }

    const { custom_id, component_type } = interaction.data;
    if (custom_id === InteractionComponent.NeatQueueIntegrationAddWizardNext.toString()) {
      switch (component_type) {
        case ComponentType.Button: {
          const step = this.wizardGetStep(formData);
          const stepData = Preconditions.checkExists(NeatQueueIntegrationWizardSteps[step]);
          if (stepData.input.type === InteractionResponseType.Modal) {
            return stepData.input;
          }
          break;
        }
        case ComponentType.ChannelSelect:
        case ComponentType.StringSelect:
        case ComponentType.UserSelect:
        case ComponentType.RoleSelect:
        case ComponentType.MentionableSelect: {
          if (!this.wizardHasNextStep(formData)) {
            return undefined;
          }

          const step = this.wizardGetStep(formData);
          const stepData = Preconditions.checkExists(NeatQueueIntegrationWizardSteps[step]);
          formData.set(stepData.key, Preconditions.checkExists(interaction.data.values[0]));

          return undefined;
        }
        default: {
          throw new UnreachableError(component_type);
        }
      }
    }

    return undefined;
  }

  private wizardGetStep(formData: Map<NeatQueueIntegrationWizardStepKey, string>): number {
    for (let i = 0; i < NeatQueueIntegrationWizardSteps.length; i++) {
      const step = Preconditions.checkExists(NeatQueueIntegrationWizardSteps[i]);

      if (formData.has(step.key)) {
        continue;
      }

      if (step.predicate == null || step.predicate(formData)) {
        return i;
      }
    }

    return NeatQueueIntegrationWizardSteps.length;
  }

  private wizardHasNextStep(formData: Map<NeatQueueIntegrationWizardStepKey, string>): boolean {
    return this.wizardGetStep(formData) < NeatQueueIntegrationWizardSteps.length;
  }

  private wizardGetCta(stepData: NeatQueueIntegrationWizardStep): APIComponentInMessageActionRow {
    const { type } = stepData.input;
    switch (type) {
      case InteractionResponseType.Modal: {
        return {
          type: ComponentType.Button,
          custom_id: InteractionComponent.NeatQueueIntegrationAddWizardNext,
          label: Preconditions.checkExists(stepData.cta),
          style: ButtonStyle.Primary,
        };
      }
      case ComponentType.Button:
      case ComponentType.StringSelect:
      case ComponentType.UserSelect:
      case ComponentType.RoleSelect:
      case ComponentType.MentionableSelect:
      case ComponentType.ChannelSelect: {
        return stepData.input;
      }

      default: {
        throw new UnreachableError(type);
      }
    }
  }

  private wizardGetDescription(
    formData: Map<NeatQueueIntegrationWizardStepKey, string>,
    prompt: string,
    prefix = "Step ",
  ): string {
    const description = [prompt];
    let stepNumber = 1;
    NeatQueueIntegrationWizardSteps.forEach((step) => {
      const value = formData.get(step.key);
      if (value != null && step.predicate?.(formData) !== false) {
        const formatValue = step.format ? step.format(value) : value;
        description.push(`${prefix}${stepNumber.toLocaleString()}: ${step.question}: ${formatValue}`);
        stepNumber += 1;
      }
    });

    return description.join("\n");
  }

  private wizardGetResponse(formData: Map<NeatQueueIntegrationWizardStepKey, string>): ExecuteResponse {
    const primaryActions: APIComponentInMessageActionRow[] = [];
    const secondaryActions: APIComponentInMessageActionRow[] = [];

    const step = this.wizardGetStep(formData);
    const stepData = Preconditions.checkExists(NeatQueueIntegrationWizardSteps[step]);
    primaryActions.push(this.wizardGetCta(stepData));

    if (step > 0) {
      secondaryActions.push(this.getActionButton(InteractionComponent.NeatQueueIntegrationAddWizardBack));
    }
    secondaryActions.push({
      ...this.getActionButton(InteractionComponent.NeatQueueIntegrationAddEditCancel),
      label: "Cancel",
      emoji: { name: "❌" },
    });
    secondaryActions.push(this.getActionButton(InteractionComponent.MainMenu));

    const components: APIActionRowComponent<APIComponentInMessageActionRow>[] = [];
    if (primaryActions.length > 0) {
      components.push({
        type: ComponentType.ActionRow,
        components: primaryActions,
      });
    }
    if (secondaryActions.length > 0) {
      components.push({
        type: ComponentType.ActionRow,
        components: secondaryActions,
      });
    }

    const content: RESTPostAPIWebhookWithTokenJSONBody = {
      content: "",
      embeds: [
        {
          title: "Add NeatQueue Integration",
          description: this.wizardGetDescription(formData, "Follow the prompts to add a NeatQueue integration."),
          fields: [
            {
              name: `Step ${(formData.size + 1).toString()}`,
              value: stepData.question,
            },
          ],
        },
      ],
      components,
    };

    return {
      response: {
        type: InteractionResponseType.UpdateMessage,
        data: content,
      },
    };
  }

  private async setupSelectNeatQueueIntegrationSaveJob(
    interaction: APIMessageComponentButtonInteraction,
  ): Promise<void> {
    const { discordService, databaseService, neatQueueService } = this.services;

    try {
      const guildId = Preconditions.checkExists(interaction.guild_id);
      const formData = this.wizardGetFormData(interaction);
      const webhookSecret = neatQueueService.hashAuthorizationKey(
        Preconditions.checkExists(formData.get(NeatQueueIntegrationWizardStepKey.WebhookSecret)),
        guildId,
      );
      const queueChannelId = Preconditions.checkExists(formData.get(NeatQueueIntegrationWizardStepKey.QueueChannel));
      const resultsChannelId = formData.get(NeatQueueIntegrationWizardStepKey.ResultsChannel) ?? queueChannelId;
      let postSeriesMode = Preconditions.checkExists(
        formData.get(NeatQueueIntegrationWizardStepKey.DisplayMode),
      ) as NeatQueuePostSeriesDisplayMode;
      let postSeriesChannelId = formData.get(NeatQueueIntegrationWizardStepKey.ResultsPostChannel) ?? null;

      if (postSeriesChannelId === resultsChannelId) {
        postSeriesMode = NeatQueuePostSeriesDisplayMode.MESSAGE;
        postSeriesChannelId = null;
      }

      const neatQueueConfig: NeatQueueConfigRow = {
        GuildId: guildId,
        ChannelId: queueChannelId,
        WebhookSecret: webhookSecret,
        ResultsChannelId: resultsChannelId,
        PostSeriesMode: postSeriesMode,
        PostSeriesChannelId: postSeriesChannelId,
      };

      await databaseService.upsertNeatQueueConfig(neatQueueConfig);

      await this.setupSelectNeatQueueIntegrationJob(interaction);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async setupNeatQueueIntegrationEditJob(
    interaction: APIMessageComponentButtonInteraction,
    successMessage?: string,
  ): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild_id);
    const fields: APIEmbedField[] = [];
    const components: APIActionRowComponent<APIComponentInMessageActionRow>[] = [];

    const [neatQueues, channels] = await Promise.all([
      databaseService.findNeatQueueConfig({ GuildId: guildId }),
      discordService.getGuildChannels(guildId),
    ]);

    fields.push({
      name: "Existing NeatQueue Integrations",
      value: neatQueues.length
        ? neatQueues
            .map(
              (neatQueue) =>
                `- <#${neatQueue.ChannelId}> (results: <#${neatQueue.ResultsChannelId}>): ${displayModeOptions.find((mode) => mode.value === neatQueue.PostSeriesMode.toString())?.label ?? "Unknown"}${neatQueue.PostSeriesChannelId != null ? ` into <#${neatQueue.PostSeriesChannelId}>` : ""}`,
            )
            .join("\n")
        : "*None*",
    });
    if (neatQueues.length > 0) {
      components.push({
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.StringSelect,
            custom_id: InteractionComponent.NeatQueueIntegrationEditChannel,
            options: neatQueues.map((neatQueue) => ({
              label: channels.find((channel) => channel.id === neatQueue.ChannelId)?.name ?? "Unknown",
              value: neatQueue.ChannelId,
            })),
            placeholder: "Select the channel to edit",
          },
        ],
      });
    }
    components.push({
      type: ComponentType.ActionRow,
      components: [
        this.getActionButton(InteractionComponent.NeatQueueIntegrationAddEditCancel),
        this.getActionButton(InteractionComponent.MainMenu),
      ],
    });

    const description = ["Select the NeatQueue integration you would like to edit."];
    if (successMessage != null) {
      description.unshift(`**✅ ${successMessage}**`);
    }
    const content: RESTPostAPIWebhookWithTokenJSONBody = {
      content: "",
      embeds: [
        {
          title: "Edit NeatQueue Integration",
          description: description.join("\n\n"),
          fields,
        },
      ],
      components,
    };

    await discordService.updateDeferredReply(interaction.token, content);
  }

  private async setupNeatQueueIntegrationEditChannelJobFromSelectMenu(
    interaction: APIMessageComponentSelectMenuInteraction,
  ): Promise<void> {
    const guildId = Preconditions.checkExists(interaction.guild_id);
    const selectedChannelId = Preconditions.checkExists(interaction.data.values[0]);

    await this.setupNeatQueueIntegrationEditChannelJob(guildId, selectedChannelId, interaction.token);
  }

  private async setupNeatQueueIntegrationEditChannelJob(
    guildId: string,
    channelId: string,
    interactionToken: string,
    successMessage?: string,
  ): Promise<void> {
    const { discordService, databaseService } = this.services;

    try {
      const neatQueueConfig = await databaseService.getNeatQueueConfig(guildId, channelId);
      const formData = new Map<NeatQueueIntegrationWizardStepKey, string>();
      formData.set(NeatQueueIntegrationWizardStepKey.QueueChannel, channelId);
      formData.set(NeatQueueIntegrationWizardStepKey.WebhookSecret, "****************");
      formData.set(
        NeatQueueIntegrationWizardStepKey.HasResultsChannel,
        channelId !== neatQueueConfig.ResultsChannelId ? "Yes" : "No",
      );
      formData.set(NeatQueueIntegrationWizardStepKey.ResultsChannel, neatQueueConfig.ResultsChannelId);
      formData.set(NeatQueueIntegrationWizardStepKey.DisplayMode, neatQueueConfig.PostSeriesMode.toString());
      formData.set(NeatQueueIntegrationWizardStepKey.ResultsPostChannel, neatQueueConfig.PostSeriesChannelId ?? "");

      const description = [
        this.wizardGetDescription(formData, `Current configuration:`, ""),
        "What would you like to do?",
      ];
      if (successMessage != null) {
        description.unshift(`**✅ ${successMessage}**`);
      }

      const options: APISelectMenuOption[] = [
        {
          label: "Change webhook secret",
          value: NeatQueueIntegrationWizardStepKey.WebhookSecret,
        },
        {
          label: "Change results channel",
          value: NeatQueueIntegrationWizardStepKey.ResultsChannel,
        },
        {
          label: "Change display mode",
          value: NeatQueueIntegrationWizardStepKey.DisplayMode,
        },
      ];
      if (neatQueueConfig.PostSeriesMode === NeatQueuePostSeriesDisplayMode.CHANNEL) {
        options.push({
          label: "Change stats post channel",
          value: NeatQueueIntegrationWizardStepKey.ResultsPostChannel,
        });
      }
      options.push({
        label: "Delete integration",
        value: "delete",
      });

      await discordService.updateDeferredReply(interactionToken, {
        embeds: [
          {
            title: `Edit NeatQueue Integration for <#${channelId}>`,
            description: description.join("\n\n"),
          },
        ],
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: InteractionComponent.NeatQueueIntegrationEditChannelOptionSelect,
                options,
              },
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                ...this.getActionButton(InteractionComponent.NeatQueueIntegrationEdit),
                label: "Back",
                emoji: { name: "🔙" },
              },
              this.getActionButton(InteractionComponent.MainMenu),
            ],
          },
        ],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interactionToken, error);
    }
  }

  private setupNeatQueueIntegrationEditChannelOptionSelect(
    interaction: APIMessageComponentSelectMenuInteraction,
  ): ExecuteResponse {
    const channelId = Preconditions.checkExists(
      interaction.message.embeds[0]?.title?.match(/<#(\d+)>/)?.[1],
      "Channel expected in title but not found",
    );
    const embed: APIEmbed = {
      title: `Edit NeatQueue Integration for <#${channelId}>`,
    };
    const actions: APIComponentInMessageActionRow[] = [];
    const handleAction = (key: NeatQueueIntegrationWizardStepKey, id: InteractionComponent): void => {
      const wizardStep = Preconditions.checkExists(NeatQueueIntegrationWizardSteps.find((step) => step.key === key));
      const input = wizardStep.input as APISelectMenuComponent;
      embed.description = wizardStep.question;
      actions.push({
        ...input,
        custom_id: id,
      });
    };

    switch (Preconditions.checkExists(interaction.data.values[0]) as NeatQueueIntegrationWizardStepKey) {
      case NeatQueueIntegrationWizardStepKey.WebhookSecret: {
        const actionButton = this.getActionButton(InteractionComponent.NeatQueueIntegrationEditChannelWebhookSecret);
        embed.description = [
          "Editing the webhook secret:",
          ...this.webhookSecretInstructions,
          `5. Click the "${actionButton.emoji?.name ?? ""} ${actionButton.label ?? ""}" button below to enter`,
        ].join("\n");
        actions.push(actionButton);
        break;
      }
      case NeatQueueIntegrationWizardStepKey.ResultsChannel: {
        handleAction(
          NeatQueueIntegrationWizardStepKey.ResultsChannel,
          InteractionComponent.NeatQueueIntegrationEditChannelResultsChannel,
        );
        break;
      }
      case NeatQueueIntegrationWizardStepKey.DisplayMode: {
        handleAction(
          NeatQueueIntegrationWizardStepKey.DisplayMode,
          InteractionComponent.NeatQueueIntegrationEditChannelDisplayMode,
        );
        break;
      }
      case NeatQueueIntegrationWizardStepKey.ResultsPostChannel: {
        handleAction(
          NeatQueueIntegrationWizardStepKey.ResultsPostChannel,
          InteractionComponent.NeatQueueIntegrationEditChannelResultsPostChannel,
        );
        break;
      }
      case NeatQueueIntegrationWizardStepKey.Delete: {
        const actionButton = this.getActionButton(InteractionComponent.NeatQueueIntegrationEditChannelDelete);
        embed.description = [
          "To delete the NeatQueue Integration follow these steps:",
          "1. Switch to the queue channel if you are not already there",
          "2. Use NeatQueue's `/webhook delete` command",
          `5. Click the "${actionButton.emoji?.name ?? ""} ${actionButton.label ?? ""}" button below to complete the deletion`,
        ].join("\n");
        actions.push(actionButton);
        break;
      }
      case NeatQueueIntegrationWizardStepKey.QueueChannel:
      case NeatQueueIntegrationWizardStepKey.HasResultsChannel:
      case NeatQueueIntegrationWizardStepKey.Complete:
      default: {
        throw new Error("Unknown option selected");
      }
    }

    return {
      response: {
        type: InteractionResponseType.UpdateMessage,
        data: {
          embeds: [embed],
          components: [
            {
              type: ComponentType.ActionRow,
              components: actions,
            },
            {
              type: ComponentType.ActionRow,
              components: [
                this.getActionButton(InteractionComponent.NeatQueueIntegrationEditChannelBack),
                this.getActionButton(InteractionComponent.MainMenu),
              ],
            },
          ],
        },
      },
    };
  }

  private async setupNeatQueueIntegrationEditChannelWebhookSecretJob(
    interaction: APIModalSubmitInteraction,
  ): Promise<void> {
    const { discordService, databaseService, neatQueueService } = this.services;

    try {
      const guildId = Preconditions.checkExists(interaction.guild_id);
      const channelId = Preconditions.checkExists(
        interaction.message?.embeds[0]?.title?.match(/<#(\d+)>/)?.[1],
        "Channel expected in title but not found",
      );
      const webhookSecret = Preconditions.checkExists(
        interaction.data.components[0]?.components[0]?.value,
        "Webhook secret expected in input but not found",
      );
      const neatQueueConfig = await databaseService.getNeatQueueConfig(guildId, channelId);
      const hashedWebhookSecret = neatQueueService.hashAuthorizationKey(webhookSecret, guildId);
      neatQueueConfig.WebhookSecret = hashedWebhookSecret;

      await databaseService.upsertNeatQueueConfig(neatQueueConfig);
      await this.setupNeatQueueIntegrationEditChannelJob(
        guildId,
        channelId,
        interaction.token,
        "Webhook secret updated",
      );
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleEditChannelJob(
    interaction: APIMessageComponentSelectMenuInteraction,
    updateConfigCallback: (config: NeatQueueConfigRow, selectedValue: string) => void,
    successMessage: string,
  ): Promise<void> {
    const { discordService, databaseService } = this.services;

    try {
      const guildId = Preconditions.checkExists(interaction.guild_id);
      const channelId = Preconditions.checkExists(
        interaction.message.embeds[0]?.title?.match(/<#(\d+)>/)?.[1],
        "Channel expected in title but not found",
      );
      const selectedValue = Preconditions.checkExists(interaction.data.values[0]);

      const neatQueueConfig = await databaseService.getNeatQueueConfig(guildId, channelId);
      updateConfigCallback(neatQueueConfig, selectedValue);
      await databaseService.upsertNeatQueueConfig(neatQueueConfig);
      await this.setupNeatQueueIntegrationEditChannelJob(guildId, channelId, interaction.token, successMessage);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async setupNeatQueueIntegrationEditChannelResultsChannelJob(
    interaction: APIMessageComponentSelectMenuInteraction,
  ): Promise<void> {
    await this.handleEditChannelJob(
      interaction,
      (config, selectedValue) => {
        config.ResultsChannelId = selectedValue;
      },
      "Results channel updated",
    );
  }

  private async setupNeatQueueIntegrationEditChannelDisplayModeJob(
    interaction: APIMessageComponentSelectMenuInteraction,
  ): Promise<void> {
    await this.handleEditChannelJob(
      interaction,
      (config, selectedValue) => {
        config.PostSeriesMode = selectedValue as NeatQueuePostSeriesDisplayMode;
      },
      "Display mode updated",
    );
  }

  private async setupNeatQueueIntegrationEditChannelResultsPostChannelJob(
    interaction: APIMessageComponentSelectMenuInteraction,
  ): Promise<void> {
    await this.handleEditChannelJob(
      interaction,
      (config, selectedValue) => {
        config.PostSeriesChannelId = selectedValue;
      },
      "Post series channel updated",
    );
  }

  private async setupNeatQueueIntegrationEditChannelBackJob(
    interaction: APIMessageComponentButtonInteraction,
  ): Promise<void> {
    const guildId = Preconditions.checkExists(interaction.guild_id);
    const channelId = Preconditions.checkExists(
      interaction.message.embeds[0]?.title?.match(/<#(\d+)>/)?.[1],
      "Channel expected in title but not found",
    );

    await this.setupNeatQueueIntegrationEditChannelJob(guildId, channelId, interaction.token);
  }

  private async setupNeatQueueIntegrationEditChannelDeleteJob(
    interaction: APIMessageComponentButtonInteraction,
  ): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild_id);
    const channelId = Preconditions.checkExists(
      interaction.message.embeds[0]?.title?.match(/<#(\d+)>/)?.[1],
      "Channel expected in title but not found",
    );

    try {
      await databaseService.deleteNeatQueueConfig(guildId, channelId);
      await this.setupNeatQueueIntegrationEditJob(interaction, "NeatQueue integration deleted");
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }
}
