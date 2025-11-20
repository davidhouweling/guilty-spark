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
  RESTJSONErrorCodes,
  PermissionFlagsBits,
} from "discord-api-types/v10";
import type { BaseInteraction, CommandData, ExecuteResponse } from "../base/base.mjs";
import { BaseCommand } from "../base/base.mjs";
import type { GuildConfigRow } from "../../services/database/types/guild_config.mjs";
import {
  MapsFormatType,
  MapsPlaylistType,
  MapsPostType,
  StatsReturnType,
} from "../../services/database/types/guild_config.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { escapeRegExp } from "../../base/regex.mjs";
import type { NeatQueueConfigRow } from "../../services/database/types/neat_queue_config.mjs";
import { NeatQueuePostSeriesDisplayMode } from "../../services/database/types/neat_queue_config.mjs";
import { DiscordError } from "../../services/discord/discord-error.mjs";
import { EndUserError } from "../../base/end-user-error.mjs";
import { HCS_LAST_UPDATED } from "../../services/halo/hcs.mjs";
import { SetupConfigEmbed } from "../../embeds/setup/setup-config-embed.mjs";
import { SetupStatsDisplayModeEmbed } from "../../embeds/setup/setup-stats-display-mode-embed.mjs";
import { SetupNeatQueueInformerEmbed } from "../../embeds/setup/setup-neatqueue-informer-embed.mjs";
import { SetupNeatQueueIntegrationEmbed } from "../../embeds/setup/setup-neatqueue-integration-embed.mjs";
import { SetupAddNeatQueueEmbed } from "../../embeds/setup/setup-add-neatqueue-embed.mjs";
import { SetupEditNeatQueueEmbed } from "../../embeds/setup/setup-edit-neatqueue-embed.mjs";
import { SetupEditNeatQueueChannelEmbed } from "../../embeds/setup/setup-edit-neatqueue-channel-embed.mjs";
import { SetupLiveTrackingConfigEmbed } from "../../embeds/setup/setup-live-tracking-config-embed.mjs";
import { SetupNeatQueueMapsConfigEmbed } from "../../embeds/setup/setup-neatqueue-maps-config-embed.mjs";

enum SetupSelectOption {
  StatsDisplayMode = "stats_display_mode",
  NeatQueueIntegration = "neatqueue_integration",
  NeatQueueInformer = "neatqueue_informer",
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
  NeatQueueInformerPlayersOnStart = "setup_neat_queue_informer_players_on_start",
  NeatQueueInformerLiveTracking = "setup_neat_queue_informer_live_tracking",
  NeatQueueInformerLiveTrackingToggle = "setup_neat_queue_informer_live_tracking_toggle",
  NeatQueueInformerLiveTrackingChannelName = "setup_neat_queue_informer_live_tracking_channel_name",
  NeatQueueInformerMaps = "setup_neat_queue_informer_maps",
  NeatQueueInformerMapsPost = "setup_neat_queue_informer_maps_post",
  NeatQueueInformerMapsPlaylist = "setup_neat_queue_informer_maps_playlist",
  NeatQueueInformerMapsFormat = "setup_neat_queue_informer_maps_format",
  NeatQueueInformerMapsCount = "setup_neat_queue_informer_maps_count",
  NeatQueueInformerMapsBack = "setup_neat_queue_informer_maps_back",
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
      channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
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
      channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
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
      channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
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
    InteractionComponent.NeatQueueInformerPlayersOnStart,
    {
      type: ComponentType.Button,
      custom_id: InteractionComponent.NeatQueueInformerPlayersOnStart,
      label: "Toggle Player Connections",
      style: ButtonStyle.Primary,
      emoji: { name: "🔌" },
    },
  ],
  [
    InteractionComponent.NeatQueueInformerLiveTracking,
    {
      type: ComponentType.Button,
      custom_id: InteractionComponent.NeatQueueInformerLiveTracking,
      label: "Configure Live Tracking",
      style: ButtonStyle.Primary,
      emoji: { name: "📊" },
    },
  ],
  [
    InteractionComponent.NeatQueueInformerLiveTrackingToggle,
    {
      type: ComponentType.Button,
      custom_id: InteractionComponent.NeatQueueInformerLiveTrackingToggle,
      label: "Toggle Live Tracking",
      style: ButtonStyle.Primary,
      emoji: { name: "📊" },
    },
  ],
  [
    InteractionComponent.NeatQueueInformerLiveTrackingChannelName,
    {
      type: ComponentType.Button,
      custom_id: InteractionComponent.NeatQueueInformerLiveTrackingChannelName,
      label: "Toggle Channel Name updates",
      style: ButtonStyle.Primary,
      emoji: { name: "🔃" },
    },
  ],
  [
    InteractionComponent.NeatQueueInformerMaps,
    {
      type: ComponentType.Button,
      custom_id: InteractionComponent.NeatQueueInformerMaps,
      label: "Configure maps generation",
      style: ButtonStyle.Primary,
      emoji: { name: "🗺️" },
    },
  ],
  [
    InteractionComponent.NeatQueueInformerMapsBack,
    {
      type: ComponentType.Button,
      custom_id: InteractionComponent.NeatQueueInformerMapsBack,
      label: "Back",
      style: ButtonStyle.Secondary,
      emoji: {
        name: "🔙",
      },
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
        custom_id: InteractionComponent.NeatQueueInformerPlayersOnStart,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueInformerLiveTracking,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueInformerLiveTrackingToggle,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueInformerLiveTrackingChannelName,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueInformerMaps,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.StringSelect,
        custom_id: InteractionComponent.NeatQueueInformerMapsPost,
        values: [],
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.StringSelect,
        custom_id: InteractionComponent.NeatQueueInformerMapsPlaylist,
        values: [],
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.StringSelect,
        custom_id: InteractionComponent.NeatQueueInformerMapsFormat,
        values: [],
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.StringSelect,
        custom_id: InteractionComponent.NeatQueueInformerMapsCount,
        values: [],
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueInformerMapsBack,
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
      case InteractionComponent.NeatQueueInformerPlayersOnStart: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () =>
            this.setupNeatQueueInformerTogglePlayerConnectionsJob(interaction as APIMessageComponentButtonInteraction),
        };
      }
      case InteractionComponent.NeatQueueInformerLiveTracking: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () =>
            this.setupNeatQueueInformerConfigureLiveTrackingJob(interaction as APIMessageComponentButtonInteraction),
        };
      }
      case InteractionComponent.NeatQueueInformerLiveTrackingToggle: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () =>
            this.setupNeatQueueInformerToggleLiveTrackingJob(interaction as APIMessageComponentButtonInteraction),
        };
      }
      case InteractionComponent.NeatQueueInformerLiveTrackingChannelName: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () =>
            this.setupNeatQueueInformerToggleChannelNameJob(interaction as APIMessageComponentButtonInteraction),
        };
      }
      case InteractionComponent.NeatQueueInformerMaps: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () =>
            this.setupNeatQueueInformerConfigureMapsJob(interaction as APIMessageComponentButtonInteraction),
        };
      }
      case InteractionComponent.NeatQueueInformerMapsPost:
      case InteractionComponent.NeatQueueInformerMapsPlaylist:
      case InteractionComponent.NeatQueueInformerMapsFormat:
      case InteractionComponent.NeatQueueInformerMapsCount: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () => this.updateMapsConfig(interaction as APIMessageComponentSelectMenuInteraction),
        };
      }
      case InteractionComponent.NeatQueueInformerMapsBack: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () =>
            this.setupSelectNeatQueueInformerJob(interaction as APIMessageComponentButtonInteraction),
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
        `**NeatQueue Informer:** Player connections ${config.NeatQueueInformerPlayerConnections == "Y" ? "enabled" : "disabled"}, Live tracking ${config.NeatQueueInformerLiveTracking == "Y" ? `enabled${config.NeatQueueInformerLiveTrackingChannelName === "Y" ? " (with channel name updates)" : ""}` : "disabled"}, Maps ${this.configMapPostToString(config.NeatQueueInformerMapsPost).toLocaleLowerCase()}`,
      ].join("\n");

      const setupConfigEmbed = new SetupConfigEmbed({ configDisplay });
      const content: RESTPostAPIWebhookWithTokenJSONBody = {
        embeds: [setupConfigEmbed.embed],
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
                  {
                    label: "Configure NeatQueue Informer",
                    value: SetupSelectOption.NeatQueueInformer,
                    description: "Configure the NeatQueue informer - info when queues start and in play",
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
      case SetupSelectOption.NeatQueueInformer: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () => this.setupSelectNeatQueueInformerJob(interaction),
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

      const setupStatsDisplayModeEmbed = new SetupStatsDisplayModeEmbed();
      const content: RESTPostAPIWebhookWithTokenJSONBody = {
        content: "",
        embeds: [setupStatsDisplayModeEmbed.embed],
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

    const setupNeatQueueIntegrationEmbed = new SetupNeatQueueIntegrationEmbed({ description, fields });
    const content: RESTPostAPIWebhookWithTokenJSONBody = {
      content: "",
      embeds: [setupNeatQueueIntegrationEmbed.embed],
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

  private async setupSelectNeatQueueInformerJob(interaction: APIMessageComponentInteraction): Promise<void> {
    const { discordService, databaseService } = this.services;

    try {
      const guildId = Preconditions.checkExists(interaction.guild_id);
      const config = await databaseService.getGuildConfig(guildId, true);

      const description = [
        "This feature works in conjunction with NeatQueue integration and applies to the whole server.",
        "",
        "To enable this feature:",
        '1. Give "Guilty Spark" a role',
        "2. Run the two commands",
        '  - `/tempchannels permissions set role="<role>" permission="View Channel" value="Allow"`',
        '  - `/tempchannels permissions set role="<role>" permission="Send Messages" value="Allow"`',
        "",
        '-# If Guilty Spark does not have permissions when it tries to interact with the queue channel, the settings will switch to "Disabled"',
      ].join("\n");
      const configDisplay = [
        `**Player Connections on queue start:** ${config.NeatQueueInformerPlayerConnections === "Y" ? "Enabled" : "Disabled"}`,
        `**Live Tracking:** ${config.NeatQueueInformerLiveTracking === "Y" ? `Enabled${config.NeatQueueInformerLiveTrackingChannelName === "Y" ? " (with channel name updates)" : ""}` : "Disabled"}`,
        `**Maps on queue start:** ${this.configMapPostToString(config.NeatQueueInformerMapsPost)}, ${this.configMapPlaylistToString(config.NeatQueueInformerMapsPlaylist)}, ${this.configMapFormatToString(config.NeatQueueInformerMapsFormat)}, ${config.NeatQueueInformerMapsCount.toString()} maps`,
      ].join("\n");

      const setupNeatQueueInformerEmbed = new SetupNeatQueueInformerEmbed({ description, configDisplay });
      const content: RESTPostAPIWebhookWithTokenJSONBody = {
        content: "",
        embeds: [setupNeatQueueInformerEmbed.embed],
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              this.getActionButton(InteractionComponent.NeatQueueInformerPlayersOnStart),
              this.getActionButton(InteractionComponent.NeatQueueInformerLiveTracking),
              this.getActionButton(InteractionComponent.NeatQueueInformerMaps),
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [this.getActionButton(InteractionComponent.MainMenu)],
          },
        ],
      };

      await discordService.updateDeferredReply(interaction.token, content);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
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
      const [submission] = interaction.data.components;
      if (submission?.type !== ComponentType.ActionRow) {
        throw new Error("Unexpected modal submission format");
      }

      const { custom_id, value } = Preconditions.checkExists(submission.components[0]);
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

    const setupAddNeatQueueEmbed = new SetupAddNeatQueueEmbed({
      description: this.wizardGetDescription(formData, "Follow the prompts to add a NeatQueue integration."),
      stepNumber: formData.size + 1,
      stepQuestion: stepData.question,
    });
    const content: RESTPostAPIWebhookWithTokenJSONBody = {
      content: "",
      embeds: [setupAddNeatQueueEmbed.embed],
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

      const guild = await discordService.getGuild(guildId);
      const appInGuild = await discordService.getGuildMember(guildId, this.env.DISCORD_APP_ID);
      const channels = [...new Set([queueChannelId, resultsChannelId, postSeriesChannelId].filter((id) => id != null))];
      const errors = new Map<string, string>();
      for (const channelId of channels) {
        try {
          const channel = await discordService.getChannel(channelId);

          if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
            errors.set(channelId, `Channel <#${channelId}> is not a text channel, select a text channel.`);
            continue;
          }

          const permissions = discordService.hasPermissions(guild, channel, appInGuild, [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.SendMessagesInThreads,
            PermissionFlagsBits.CreatePublicThreads,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.UseApplicationCommands,
          ]);

          if (!permissions.hasAll) {
            errors.set(
              channelId,
              `Missing permissions: ${permissions.missing.map((permission) => discordService.permissionToString(permission)).join(", ")}`,
            );
          }
        } catch (error) {
          const genericError =
            "An unexpected error occurred trying to access this channel (it has been logged and will be investigated), try again later or try a different channel.";

          if (error instanceof DiscordError) {
            const errorMessages = new Map<RESTJSONErrorCodes, string>([
              [RESTJSONErrorCodes.UnknownChannel, `Channel does not exist.`],
              [
                RESTJSONErrorCodes.MissingAccess,
                `Missing access to channel. Add me to the channel and grant me permissions "View Channel", "Send Messages", "Send Messages in Threads", "Create Public Threads", "Embed Links", "Read Message History", and "Use Application Commands".`,
              ],
            ]);

            errors.set(channelId, errorMessages.get(error.restError.code) ?? genericError);
          } else {
            errors.set(channelId, genericError);
          }
        }
      }

      if (errors.size === 0) {
        await databaseService.upsertNeatQueueConfig(neatQueueConfig);
        await this.setupSelectNeatQueueIntegrationJob(interaction);
        return;
      }

      const error = new EndUserError(
        Array.from(errors.entries())
          .map(([channelId, message]) => `- <#${channelId}>: ${message}`)
          .join("\n"),
        {
          title: "Unable to save due to the following errors",
          handled: true,
        },
      );
      await discordService.updateDeferredReply(interaction.token, {
        embeds: [Preconditions.checkExists(interaction.message.embeds[0]), error.discordEmbed],
        components: interaction.message.components,
      });
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
    const setupEditNeatQueueEmbed = new SetupEditNeatQueueEmbed({
      description: description.join("\n\n"),
      fields,
    });
    const content: RESTPostAPIWebhookWithTokenJSONBody = {
      content: "",
      embeds: [setupEditNeatQueueEmbed.embed],
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
      formData.set(NeatQueueIntegrationWizardStepKey.DisplayMode, neatQueueConfig.PostSeriesMode);
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

      const setupEditNeatQueueChannelEmbed = new SetupEditNeatQueueChannelEmbed({
        channelId,
        description: description.join("\n\n"),
      });
      await discordService.updateDeferredReply(interactionToken, {
        embeds: [setupEditNeatQueueChannelEmbed.embed],
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
      const [submission] = interaction.data.components;
      if (submission?.type !== ComponentType.ActionRow) {
        throw new Error("Unexpected modal submission format");
      }
      const webhookSecret = Preconditions.checkExists(
        submission.components[0]?.value,
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

  private async setupNeatQueueInformerTogglePlayerConnectionsJob(
    interaction: APIMessageComponentButtonInteraction,
  ): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild_id);
    const config = await databaseService.getGuildConfig(guildId, true);

    try {
      await databaseService.updateGuildConfig(guildId, {
        NeatQueueInformerPlayerConnections: config.NeatQueueInformerPlayerConnections === "Y" ? "N" : "Y",
      });
      await this.setupSelectNeatQueueInformerJob(interaction);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async setupNeatQueueInformerConfigureLiveTrackingJob(
    interaction: APIMessageComponentButtonInteraction,
  ): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild_id);

    try {
      const config = await databaseService.getGuildConfig(guildId, true);

      const configDisplay = [
        `**Live Tracking:** ${config.NeatQueueInformerLiveTracking === "Y" ? "Enabled" : "Disabled"}`,
        `**Channel Name Updates:** ${config.NeatQueueInformerLiveTrackingChannelName === "Y" ? "Enabled" : "Disabled"}${config.NeatQueueInformerLiveTracking === "N" ? " (requires live tracking)" : ""}`,
      ].join("\n");

      const setupLiveTrackingConfigEmbed = new SetupLiveTrackingConfigEmbed({
        configDisplay,
      });
      const content: RESTPostAPIWebhookWithTokenJSONBody = {
        content: "",
        embeds: [setupLiveTrackingConfigEmbed.embed],
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                custom_id: InteractionComponent.NeatQueueInformerLiveTrackingToggle,
                label: "Toggle Live Tracking",
                style: ButtonStyle.Primary,
                emoji: { name: "📊" },
              },
              {
                type: ComponentType.Button,
                custom_id: InteractionComponent.NeatQueueInformerLiveTrackingChannelName,
                label: "Toggle Channel Name updates",
                style: ButtonStyle.Primary,
                emoji: { name: "🔃" },
                disabled: config.NeatQueueInformerLiveTracking === "N",
              },
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                custom_id: InteractionComponent.NeatQueueInformerMapsBack,
                label: "Back to Informer",
                style: ButtonStyle.Secondary,
                emoji: { name: "🔙" },
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

  private async setupNeatQueueInformerToggleLiveTrackingJob(
    interaction: APIMessageComponentButtonInteraction,
  ): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild_id);

    try {
      const config = await databaseService.getGuildConfig(guildId, true);
      const newValue = config.NeatQueueInformerLiveTracking === "Y" ? "N" : "Y";

      await databaseService.updateGuildConfig(guildId, {
        NeatQueueInformerLiveTracking: newValue,
        // If disabling live tracking, also disable channel name updates
        ...(newValue === "N" && { NeatQueueInformerLiveTrackingChannelName: "N" }),
      });

      // Return to the live tracking configuration screen
      await this.setupNeatQueueInformerConfigureLiveTrackingJob(interaction);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async setupNeatQueueInformerToggleChannelNameJob(
    interaction: APIMessageComponentButtonInteraction,
  ): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild_id);

    try {
      const config = await databaseService.getGuildConfig(guildId, true);

      await databaseService.updateGuildConfig(guildId, {
        NeatQueueInformerLiveTrackingChannelName: config.NeatQueueInformerLiveTrackingChannelName === "Y" ? "N" : "Y",
      });

      // Return to the live tracking configuration screen
      await this.setupNeatQueueInformerConfigureLiveTrackingJob(interaction);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async setupNeatQueueInformerConfigureMapsJob(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild_id);

    try {
      const config = await databaseService.getGuildConfig(guildId, true);

      const configDisplay = [
        `**Trigger:** ${this.configMapPostToString(config.NeatQueueInformerMapsPost)}`,
        `**Playlist:** ${this.configMapPlaylistToString(config.NeatQueueInformerMapsPlaylist)}`,
        `**Format:** ${this.configMapFormatToString(config.NeatQueueInformerMapsFormat)}`,
        `**Count:** ${config.NeatQueueInformerMapsCount.toString()}`,
      ].join("\n");

      const setupNeatQueueMapsConfigEmbed = new SetupNeatQueueMapsConfigEmbed({
        configDisplay,
      });
      const content: RESTPostAPIWebhookWithTokenJSONBody = {
        content: "",
        embeds: [setupNeatQueueMapsConfigEmbed.embed],
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: InteractionComponent.NeatQueueInformerMapsPost,
                options: [
                  {
                    label: this.configMapPostToString(MapsPostType.AUTO),
                    value: MapsPostType.AUTO,
                    description: "Automatically generate maps as soon as the queue channel is created",
                  },
                  {
                    label: this.configMapPostToString(MapsPostType.BUTTON),
                    value: MapsPostType.BUTTON,
                    description: "Display a button for players to manually generate the maps",
                  },
                  {
                    label: this.configMapPostToString(MapsPostType.OFF),
                    value: MapsPostType.OFF,
                    description: "No maps generated or button displayed, players can still use /maps command",
                  },
                ],
                placeholder: "Configure trigger",
              },
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: InteractionComponent.NeatQueueInformerMapsPlaylist,
                options: [
                  {
                    label: this.configMapPlaylistToString(MapsPlaylistType.HCS_CURRENT),
                    value: MapsPlaylistType.HCS_CURRENT,
                    description: `The current maps and modes of HCS (as of ${HCS_LAST_UPDATED})`,
                  },
                  {
                    label: this.configMapPlaylistToString(MapsPlaylistType.HCS_HISTORICAL),
                    value: MapsPlaylistType.HCS_HISTORICAL,
                    description: "All maps and modes that have been played at any HCS major event",
                  },
                ],
                placeholder: "Configure playlist",
              },
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: InteractionComponent.NeatQueueInformerMapsFormat,
                options: [
                  {
                    label: this.configMapFormatToString(MapsFormatType.HCS),
                    value: MapsFormatType.HCS,
                    description: "Obj, slayer, obj, obj, slayer, ...",
                  },
                  {
                    label: this.configMapFormatToString(MapsFormatType.RANDOM),
                    value: MapsFormatType.RANDOM,
                    description: "Randomly pick objective or slayer for each map",
                  },
                  {
                    label: this.configMapFormatToString(MapsFormatType.OBJECTIVE),
                    value: MapsFormatType.OBJECTIVE,
                    description: "Only pick objective modes",
                  },
                  {
                    label: this.configMapFormatToString(MapsFormatType.SLAYER),
                    value: MapsFormatType.SLAYER,
                    description: "Only pick slayer modes",
                  },
                ],
                placeholder: "Configure format",
              },
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: InteractionComponent.NeatQueueInformerMapsCount,
                options: [
                  {
                    label: "1",
                    value: "1",
                  },
                  {
                    label: "3",
                    value: "3",
                  },
                  {
                    label: "5",
                    value: "5",
                  },
                  {
                    label: "7",
                    value: "7",
                  },
                ],
                placeholder: "Configure count",
              },
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              this.getActionButton(InteractionComponent.NeatQueueInformerMapsBack),
              this.getActionButton(InteractionComponent.MainMenu),
            ],
          },
        ],
      };

      await discordService.updateDeferredReply(interaction.token, content);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private configMapPostToString(mapPostType: MapsPostType): string {
    switch (mapPostType) {
      case MapsPostType.AUTO: {
        return "Automatic";
      }
      case MapsPostType.BUTTON: {
        return "As a button";
      }
      case MapsPostType.OFF: {
        return "Off";
      }
      default: {
        throw new UnreachableError(mapPostType);
      }
    }
  }

  private configMapPlaylistToString(playlistType: MapsPlaylistType): string {
    switch (playlistType) {
      case MapsPlaylistType.HCS_CURRENT: {
        return "HCS - Current";
      }
      case MapsPlaylistType.HCS_HISTORICAL: {
        return "HCS - Historical";
      }
      case MapsPlaylistType.RANKED_ARENA: {
        return "Ranked Arena";
      }
      case MapsPlaylistType.RANKED_SLAYER: {
        return "Ranked Slayer";
      }
      case MapsPlaylistType.RANKED_SNIPERS: {
        return "Ranked Snipers";
      }
      case MapsPlaylistType.RANKED_TACTICAL: {
        return "Ranked Tactical";
      }
      case MapsPlaylistType.RANKED_DOUBLES: {
        return "Ranked Doubles";
      }
      case MapsPlaylistType.RANKED_FFA: {
        return "Ranked FFA";
      }
      case MapsPlaylistType.RANKED_SQUAD_BATTLE: {
        return "Ranked Squad Battle";
      }
      default: {
        throw new UnreachableError(playlistType);
      }
    }
  }

  private configMapFormatToString(formatType: MapsFormatType): string {
    switch (formatType) {
      case MapsFormatType.HCS: {
        return "HCS";
      }
      case MapsFormatType.RANDOM: {
        return "Random";
      }
      case MapsFormatType.OBJECTIVE: {
        return "Objective only";
      }
      case MapsFormatType.SLAYER: {
        return "Slayer only";
      }
      default: {
        throw new UnreachableError(formatType);
      }
    }
  }

  private async updateMapsConfig(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { databaseService, discordService } = this.services;
    try {
      const guildId = Preconditions.checkExists(interaction.guild_id);
      const config: Partial<GuildConfigRow> = {};

      const value = Preconditions.checkExists(interaction.data.values[0]);
      type SupportedMapsConfigComponent =
        | InteractionComponent.NeatQueueInformerMapsPost
        | InteractionComponent.NeatQueueInformerMapsPlaylist
        | InteractionComponent.NeatQueueInformerMapsFormat
        | InteractionComponent.NeatQueueInformerMapsCount;
      const customId = interaction.data.custom_id as SupportedMapsConfigComponent;

      switch (customId) {
        case InteractionComponent.NeatQueueInformerMapsPost: {
          config.NeatQueueInformerMapsPost = value as MapsPostType;
          break;
        }
        case InteractionComponent.NeatQueueInformerMapsPlaylist: {
          config.NeatQueueInformerMapsPlaylist = value as MapsPlaylistType;
          break;
        }
        case InteractionComponent.NeatQueueInformerMapsFormat: {
          config.NeatQueueInformerMapsFormat = value as MapsFormatType;
          break;
        }
        case InteractionComponent.NeatQueueInformerMapsCount: {
          config.NeatQueueInformerMapsCount = parseInt(value, 10);
          break;
        }
        default: {
          throw new UnreachableError(customId);
        }
      }

      await databaseService.updateGuildConfig(guildId, config);
      await this.setupNeatQueueInformerConfigureMapsJob(interaction);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }
}
