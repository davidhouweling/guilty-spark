import type {
  APIEmbedField,
  RESTPostAPIWebhookWithTokenJSONBody,
  APIMessageComponentSelectMenuInteraction,
  APIButtonComponentWithCustomId,
  APIMessageComponentButtonInteraction,
  APIModalSubmitInteraction,
  APIModalInteractionResponse,
  APISelectMenuComponent,
  APISelectMenuOption,
  APIActionRowComponent,
  APIMessageStringSelectInteractionData,
  APIMessageChannelSelectInteractionData,
} from "discord-api-types/v10";
import {
  InteractionContextType,
  ApplicationCommandType,
  ComponentType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  ButtonStyle,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
} from "discord-api-types/v10";
import type {
  BaseInteraction,
  ExecuteResponse,
  ComponentHandlerMap,
  ApplicationCommandData,
} from "../base/base-command.mjs";
import { BaseCommand } from "../base/base-command.mjs";
import type { GuildConfigRow } from "../../services/database/types/guild_config.mjs";
import {
  StatsReturnType,
  MapsPostType,
  MapsPlaylistType,
  MapsFormatType,
} from "../../services/database/types/guild_config.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { HCS_LAST_UPDATED } from "../../services/halo/hcs.mjs";
import { SetupConfigEmbed } from "../../embeds/setup/setup-config-embed.mjs";
import { SetupStatsDisplayModeEmbed } from "../../embeds/setup/setup-stats-display-mode-embed.mjs";
import { SetupNeatQueueInformerEmbed } from "../../embeds/setup/setup-neatqueue-informer-embed.mjs";
import { SetupNeatQueueIntegrationEmbed } from "../../embeds/setup/setup-neatqueue-integration-embed.mjs";
import { SetupLiveTrackingConfigEmbed } from "../../embeds/setup/setup-live-tracking-config-embed.mjs";
import { SetupNeatQueueMapsConfigEmbed } from "../../embeds/setup/setup-neatqueue-maps-config-embed.mjs";
import { SetupAddNeatQueueEmbed } from "../../embeds/setup/setup-add-neatqueue-embed.mjs";
import { SetupEditNeatQueueEmbed } from "../../embeds/setup/setup-edit-neatqueue-embed.mjs";
import { SetupEditNeatQueueChannelEmbed } from "../../embeds/setup/setup-edit-neatqueue-channel-embed.mjs";
import type { NeatQueueConfigRow } from "../../services/database/types/neat_queue_config.mjs";
import { NeatQueuePostSeriesDisplayMode } from "../../services/database/types/neat_queue_config.mjs";
import { DiscordError } from "../../services/discord/discord-error.mjs";
import { EndUserError } from "../../base/end-user-error.mjs";
import { escapeRegExp } from "../../base/regex.mjs";

enum SetupSelectOption {
  StatsDisplayMode = "stats_display_mode",
  NeatQueueIntegration = "neatqueue_integration",
  NeatQueueInformer = "neatqueue_informer",
}

enum SetupStatsDisplayModeOption {
  SeriesOnly = "series_only",
  SeriesAndGames = "series_games",
}

enum WizardStepKey {
  WebhookSecret = "webhook_secret",
  QueueChannel = "queue_channel",
  HasResultsChannel = "has_results_channel",
  ResultsChannel = "results_channel",
  DisplayMode = "display_mode",
  ResultsPostChannel = "results_post_channel",
  Complete = "complete",
  Delete = "delete",
}

const displayModeOptions: APISelectMenuOption[] = [
  { label: "Threaded message of the results", value: NeatQueuePostSeriesDisplayMode.THREAD },
  { label: "New message in results channel", value: NeatQueuePostSeriesDisplayMode.MESSAGE },
  { label: "New message in a different channel", value: NeatQueuePostSeriesDisplayMode.CHANNEL },
];

/**
 * Interaction component IDs for the setup command
 */
export enum InteractionComponent {
  SetupSelect = "setup_select",
  MainMenu = "setup_main_menu",
  SetupStatsDisplayMode = "setup_stats_display_mode",
  NeatQueueIntegrationAdd = "setup_neat_queue_add",
  NeatQueueIntegrationEdit = "setup_neat_queue_edit",
  // Wizard - shared components
  WizardNext = "wizard_next",
  WizardBack = "wizard_back",
  WizardSave = "wizard_save",
  WizardCancel = "wizard_cancel",
  // Edit wizard components
  EditSelectChannel = "edit_select_channel",
  EditSelectOption = "edit_select_option",
  EditWebhookSecret = "edit_webhook_secret",
  EditWebhookSecretModal = "edit_webhook_secret_modal",
  EditResultsChannel = "edit_results_channel",
  EditDisplayMode = "edit_display_mode",
  EditResultsPostChannel = "edit_results_post_channel",
  EditDelete = "edit_delete",
  EditBack = "edit_back",
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

type WizardStep = {
  key: WizardStepKey;
  question: string;
  predicate?: (form: Map<WizardStepKey, string>) => boolean;
} & (
  | {
      input: APIModalInteractionResponse;
      cta: string;
    }
  | {
      input: APISelectMenuComponent | APIButtonComponentWithCustomId;
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

const wizardSteps: WizardStep[] = [
  {
    key: WizardStepKey.WebhookSecret,
    question: "What is the webhook secret?",
    cta: "🔐 Enter webhook secret",
    format: (value) => `\`${value}\``,
    extract: (value) => value.substring(1, value.length - 1),
    input: {
      type: InteractionResponseType.Modal,
      data: {
        title: "Webhook Secret Entry",
        custom_id: InteractionComponent.WizardNext,
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.TextInput,
                custom_id: WizardStepKey.WebhookSecret,
                label: "Webhook Secret",
                style: TextInputStyle.Short,
                required: true,
                min_length: 16,
                max_length: 32,
              },
            ],
          },
        ],
      },
    },
  },
  {
    key: WizardStepKey.QueueChannel,
    question: "What channel is the queue in?",
    format: (value) => `<#${value}>`,
    extract: (value) => value.substring(2, value.length - 1),
    input: {
      type: ComponentType.ChannelSelect,
      custom_id: InteractionComponent.WizardNext,
      channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      min_values: 1,
      max_values: 1,
      placeholder: "Select the queue channel",
    },
  },
  {
    key: WizardStepKey.HasResultsChannel,
    question: "Is the results channel different to the queue channel?",
    input: {
      type: ComponentType.StringSelect,
      custom_id: InteractionComponent.WizardNext,
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
    key: WizardStepKey.ResultsChannel,
    question: "What channel does NeatQueue put the results in?",
    format: (value) => `<#${value}>`,
    extract: (value) => value.substring(2, value.length - 1),
    input: {
      type: ComponentType.ChannelSelect,
      custom_id: InteractionComponent.WizardNext,
      channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      min_values: 1,
      max_values: 1,
      placeholder: "Select the results channel",
    },
    predicate: (form) => form.get(WizardStepKey.HasResultsChannel) === "Yes",
  },
  {
    key: WizardStepKey.DisplayMode,
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
      custom_id: InteractionComponent.WizardNext,
      min_values: 1,
      max_values: 1,
      options: displayModeOptions,
    },
  },
  {
    key: WizardStepKey.ResultsPostChannel,
    question: "Which channel should the results be posted in?",
    format: (value) => `<#${value}>`,
    extract: (value) => value.substring(2, value.length - 1),
    input: {
      type: ComponentType.ChannelSelect,
      custom_id: InteractionComponent.WizardNext,
      channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      min_values: 1,
      max_values: 1,
      placeholder: "Select the results post channel",
    },
    predicate: (form) => form.get(WizardStepKey.DisplayMode) === NeatQueuePostSeriesDisplayMode.CHANNEL,
  },
  {
    key: WizardStepKey.Complete,
    question: "End of the questions! Please confirm the details above.",
    input: {
      type: ComponentType.Button,
      custom_id: InteractionComponent.WizardSave,
      label: "Yep all good, save it!",
      style: ButtonStyle.Primary,
      emoji: { name: "✅" },
    },
  },
];

/**
 * Refactored SetupCommand using declarative handler map pattern
 */
export class SetupCommand extends BaseCommand {
  readonly webhookSecretInstructions = [
    `1. Copy this URL: \n\`${this.env.HOST_URL}/neatqueue\``,
    "2. Switch to the queue channel if you are not already there",
    "3. Use NeatQueue's `/webhook add` command and paste in the url",
    "4. NeatQueue will reply with a webhook secret, copy it",
  ];

  /**
   * Component handlers - type-safe and automatically generates registration data.
   *
   * Each handler uses helper methods (buttonHandler, stringSelectHandler) that:
   * - Provide automatic type inference for the interaction parameter
   * - Eliminate manual type casting
   * - Register component metadata for auto-generation
   *
   * Response patterns:
   * - deferUpdate() - Defers message update, runs async job
   * - deferReply() - Defers channel reply, runs async job
   * - immediateResponse() - Returns immediate response, no job
   */
  protected override readonly components: ComponentHandlerMap = this.createHandlerMap(InteractionComponent, {
    [InteractionComponent.SetupSelect]: this.stringSelectHandler((interaction) =>
      this.deferUpdate(async () => this.handleSetupSelect(interaction)),
    ),

    [InteractionComponent.SetupStatsDisplayMode]: this.stringSelectHandler((interaction) =>
      this.deferUpdate(async () => this.handleUpdateStatsDisplayMode(interaction)),
    ),

    [InteractionComponent.MainMenu]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.handleMainMenu(interaction)),
    ),

    [InteractionComponent.NeatQueueIntegrationAdd]: this.buttonHandler(() => this.wizardNext(null)),

    [InteractionComponent.WizardNext]: this.buttonHandler((interaction) => this.wizardNext(interaction)),

    [InteractionComponent.WizardBack]: this.buttonHandler((interaction) => this.wizardBack(interaction)),

    [InteractionComponent.WizardSave]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.handleWizardSave(interaction)),
    ),

    [InteractionComponent.WizardCancel]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.showNeatQueueIntegrationConfig(interaction)),
    ),

    [InteractionComponent.NeatQueueIntegrationEdit]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.showEditIntegrationList(interaction)),
    ),

    [InteractionComponent.EditSelectChannel]: this.stringSelectHandler((interaction) =>
      this.deferUpdate(async () => this.showEditChannelOptions(interaction)),
    ),

    [InteractionComponent.EditSelectOption]: this.stringSelectHandler((interaction) =>
      this.handleEditOptionSelect(interaction),
    ),

    [InteractionComponent.EditWebhookSecret]: this.buttonHandler(() => this.handleEditWebhookSecretButton()),

    [InteractionComponent.EditWebhookSecretModal]: this.modalHandler((interaction) =>
      this.deferUpdate(async () => this.handleEditWebhookSecretModal(interaction)),
    ),

    [InteractionComponent.EditResultsChannel]: this.channelSelectHandler((interaction) =>
      this.deferUpdate(async () => this.handleEditField(interaction, "ResultsChannelId")),
    ),

    [InteractionComponent.EditDisplayMode]: this.stringSelectHandler((interaction) =>
      this.deferUpdate(async () => this.handleEditDisplayMode(interaction)),
    ),

    [InteractionComponent.EditResultsPostChannel]: this.channelSelectHandler((interaction) =>
      this.deferUpdate(async () => this.handleEditField(interaction, "PostSeriesChannelId")),
    ),

    [InteractionComponent.EditDelete]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.handleDeleteIntegration(interaction)),
    ),

    [InteractionComponent.EditBack]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.showEditIntegrationList(interaction)),
    ),

    [InteractionComponent.NeatQueueInformerPlayersOnStart]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.handleTogglePlayerConnections(interaction)),
    ),

    [InteractionComponent.NeatQueueInformerLiveTracking]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.showLiveTrackingConfig(interaction)),
    ),

    [InteractionComponent.NeatQueueInformerLiveTrackingToggle]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.handleToggleLiveTracking(interaction)),
    ),

    [InteractionComponent.NeatQueueInformerLiveTrackingChannelName]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.handleToggleChannelName(interaction)),
    ),

    [InteractionComponent.NeatQueueInformerMaps]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.showMapsConfig(interaction)),
    ),

    [InteractionComponent.NeatQueueInformerMapsPost]: this.stringSelectHandler((interaction) =>
      this.deferUpdate(async () => this.handleUpdateMapsConfig(interaction)),
    ),

    [InteractionComponent.NeatQueueInformerMapsPlaylist]: this.stringSelectHandler((interaction) =>
      this.deferUpdate(async () => this.handleUpdateMapsConfig(interaction)),
    ),

    [InteractionComponent.NeatQueueInformerMapsFormat]: this.stringSelectHandler((interaction) =>
      this.deferUpdate(async () => this.handleUpdateMapsConfig(interaction)),
    ),

    [InteractionComponent.NeatQueueInformerMapsCount]: this.stringSelectHandler((interaction) =>
      this.deferUpdate(async () => this.handleUpdateMapsConfig(interaction)),
    ),

    [InteractionComponent.NeatQueueInformerMapsBack]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.showNeatQueueInformerConfig(interaction)),
    ),
  });

  /**
   * Slash command registration data
   */
  readonly commands: ApplicationCommandData[] = [
    {
      type: ApplicationCommandType.ChatInput,
      name: "setup",
      description: "Setup Guilty Spark for your server",
      contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
      default_member_permissions: (1 << 5).toString(),
      options: [],
    },
  ];

  override execute(interaction: BaseInteraction): ExecuteResponse {
    if (interaction.guild?.id == null) {
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

    return super.execute(interaction);
  }

  protected handleInteraction(interaction: BaseInteraction): ExecuteResponse {
    const { type } = interaction;

    switch (type) {
      case InteractionType.ApplicationCommand: {
        return this.deferReply(async () => this.handleApplicationCommand(interaction), true);
      }
      case InteractionType.MessageComponent: {
        const customId = interaction.data.custom_id as InteractionComponent;

        // Special handling for WizardNext which can be button or select menu
        if (customId === InteractionComponent.WizardNext) {
          return this.wizardNext(interaction);
        }

        const handler = this.components[customId];

        if (!handler) {
          throw new Error(`No handler found for component: ${customId}`);
        }

        return this.executeComponentHandler(handler, interaction);
      }
      case InteractionType.ModalSubmit: {
        const customId = interaction.data.custom_id as InteractionComponent;

        // Special handling for WizardNext modal submissions
        if (customId === InteractionComponent.WizardNext) {
          return this.wizardNext(interaction);
        }

        const handler = this.components[customId];

        if (!handler) {
          throw new Error(`No handler found for component: ${customId}`);
        }

        return this.executeComponentHandler(handler, interaction);
      }
      default: {
        throw new UnreachableError(type);
      }
    }
  }

  // ============================================================================
  // Wizard Methods - Add Integration Flow
  // ============================================================================

  private wizardNext(
    interaction:
      | APIModalSubmitInteraction
      | APIMessageComponentButtonInteraction
      | APIMessageComponentSelectMenuInteraction
      | null,
  ): ExecuteResponse {
    const formData = this.getWizardFormData(interaction);
    const maybeResponse = this.processWizardInteraction(interaction, formData);

    if (maybeResponse) {
      return { response: maybeResponse };
    }

    return this.getWizardResponse(formData, "Follow the prompts to add a NeatQueue integration.");
  }

  private wizardBack(interaction: APIMessageComponentButtonInteraction): ExecuteResponse {
    const formData = this.getWizardFormData(interaction);
    const lastEntry = Array.from(formData.keys()).pop();

    if (lastEntry != null) {
      formData.delete(lastEntry);
    }

    return this.getWizardResponse(formData, "Follow the prompts to add a NeatQueue integration.");
  }

  private getWizardFormData(
    interaction:
      | APIModalSubmitInteraction
      | APIMessageComponentButtonInteraction
      | APIMessageComponentSelectMenuInteraction
      | null,
  ): Map<WizardStepKey, string> {
    const formData = new Map<WizardStepKey, string>();

    if (interaction == null) {
      return formData;
    }

    const description = interaction.message?.embeds[0]?.description ?? "";

    for (const step of wizardSteps) {
      const regex = new RegExp(`${escapeRegExp(step.question)}: (.*)`);
      const match = description.match(regex);

      if (match?.[1] != null) {
        const value = step.extract ? step.extract(match[1].trim()) : match[1].trim();
        formData.set(step.key, value);
      }
    }

    return formData;
  }

  private processWizardInteraction(
    interaction:
      | APIModalSubmitInteraction
      | APIMessageComponentButtonInteraction
      | APIMessageComponentSelectMenuInteraction
      | null,
    formData: Map<WizardStepKey, string>,
  ): APIModalInteractionResponse | undefined {
    if (interaction == null) {
      return undefined;
    }

    if (interaction.type === InteractionType.ModalSubmit) {
      const [submission] = interaction.data.components;
      if (submission?.type !== ComponentType.ActionRow) {
        throw new Error("Unexpected modal submission format");
      }

      const { custom_id, value } = Preconditions.checkExists(submission.components[0]);
      formData.set(custom_id as WizardStepKey, value);
      return undefined;
    }

    const componentType = interaction.data.component_type as ComponentType;
    const customId = interaction.data.custom_id as InteractionComponent;

    if (customId === InteractionComponent.WizardNext) {
      switch (componentType) {
        case ComponentType.Button: {
          const step = this.getWizardStep(formData);
          const stepData = Preconditions.checkExists(wizardSteps[step]);
          if (stepData.input.type === InteractionResponseType.Modal) {
            return stepData.input;
          }
          break;
        }
        case ComponentType.ChannelSelect:
        case ComponentType.StringSelect: {
          if (!this.hasNextWizardStep(formData)) {
            return undefined;
          }

          const step = this.getWizardStep(formData);
          const stepData = Preconditions.checkExists(wizardSteps[step]);
          const data = interaction.data as
            | APIMessageStringSelectInteractionData
            | APIMessageChannelSelectInteractionData;
          formData.set(stepData.key, Preconditions.checkExists(data.values[0]));

          return undefined;
        }
        case ComponentType.ActionRow:
        case ComponentType.TextInput:
        case ComponentType.UserSelect:
        case ComponentType.RoleSelect:
        case ComponentType.MentionableSelect:
        case ComponentType.Section:
        case ComponentType.TextDisplay:
        case ComponentType.Thumbnail:
        case ComponentType.MediaGallery:
        case ComponentType.File:
        case ComponentType.Separator:
        case ComponentType.ContentInventoryEntry:
        case ComponentType.Container:
        case ComponentType.Label:
        case ComponentType.FileUpload:
        default: {
          throw new Error(`Unsupported component type in wizard next: ${componentType.toString()}`);
        }
      }
    }

    return undefined;
  }

  private getWizardStep(formData: Map<WizardStepKey, string>): number {
    for (let i = 0; i < wizardSteps.length; i++) {
      const step = Preconditions.checkExists(wizardSteps[i]);

      if (formData.has(step.key)) {
        continue;
      }

      if (step.predicate == null || step.predicate(formData)) {
        return i;
      }
    }

    return wizardSteps.length;
  }

  private hasNextWizardStep(formData: Map<WizardStepKey, string>): boolean {
    return this.getWizardStep(formData) < wizardSteps.length;
  }

  private getWizardCta(stepData: WizardStep): APIButtonComponentWithCustomId | APISelectMenuComponent {
    const { input } = stepData;
    if (input.type === InteractionResponseType.Modal) {
      return {
        type: ComponentType.Button,
        custom_id: InteractionComponent.WizardNext,
        label: Preconditions.checkExists(stepData.cta),
        style: ButtonStyle.Primary,
      };
    }

    // For all component types (Button, StringSelect, ChannelSelect, etc.)
    return input;
  }

  private getWizardDescription(formData: Map<WizardStepKey, string>, prompt: string): string {
    const description = [prompt];
    let stepNumber = 1;
    for (const step of wizardSteps) {
      const value = formData.get(step.key);
      if (value != null && step.predicate?.(formData) !== false) {
        const formatValue = step.format ? step.format(value) : value;
        description.push(`Step ${stepNumber.toLocaleString()}: ${step.question}: ${formatValue}`);
        stepNumber += 1;
      }
    }

    return description.join("\n");
  }

  private getWizardResponse(formData: Map<WizardStepKey, string>, prompt: string): ExecuteResponse {
    const step = this.getWizardStep(formData);
    const stepData = Preconditions.checkExists(wizardSteps[step]);

    // Add webhook instructions to step 1 description
    let description = this.getWizardDescription(formData, prompt);
    if (step === 0) {
      description = [description, "", "**Step 1: Get the webhook secret**", ...this.webhookSecretInstructions].join(
        "\n",
      );
    }

    const setupAddNeatQueueEmbed = new SetupAddNeatQueueEmbed({
      description,
      stepNumber: formData.size + 1,
      stepQuestion: stepData.question,
    });

    const primaryActions: (APIButtonComponentWithCustomId | APISelectMenuComponent)[] = [this.getWizardCta(stepData)];
    const secondaryActions: APIButtonComponentWithCustomId[] = [];

    if (step > 0) {
      secondaryActions.push({
        type: ComponentType.Button,
        custom_id: InteractionComponent.WizardBack,
        label: "Back",
        style: ButtonStyle.Secondary,
        emoji: { name: "🔙" },
      });
    }

    secondaryActions.push({
      type: ComponentType.Button,
      custom_id: InteractionComponent.WizardCancel,
      label: "Cancel",
      style: ButtonStyle.Secondary,
      emoji: { name: "\u274c" },
    });

    const components: APIActionRowComponent<APIButtonComponentWithCustomId | APISelectMenuComponent>[] = [];
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

  private async handleWizardSave(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { discordService, databaseService, neatQueueService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild_id);

    try {
      const formData = this.getWizardFormData(interaction);
      const webhookSecret = neatQueueService.hashAuthorizationKey(
        Preconditions.checkExists(formData.get(WizardStepKey.WebhookSecret)),
        guildId,
      );
      const queueChannelId = Preconditions.checkExists(formData.get(WizardStepKey.QueueChannel));
      const resultsChannelId = formData.get(WizardStepKey.ResultsChannel) ?? queueChannelId;
      let postSeriesMode = Preconditions.checkExists(
        formData.get(WizardStepKey.DisplayMode),
      ) as NeatQueuePostSeriesDisplayMode;
      let postSeriesChannelId = formData.get(WizardStepKey.ResultsPostChannel) ?? null;

      // If posting to same channel as results, simplify to MESSAGE mode
      if (postSeriesChannelId === resultsChannelId) {
        postSeriesMode = NeatQueuePostSeriesDisplayMode.MESSAGE;
        postSeriesChannelId = null;
      }

      // Validate channels and permissions
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

      if (errors.size > 0) {
        const error = new EndUserError(
          Array.from(errors.entries())
            .map(([channelId, message]) => `- <#${channelId}>: ${message}`)
            .join("\\n"),
          {
            title: "Unable to save due to the following errors",
            handled: true,
          },
        );
        await discordService.updateDeferredReply(interaction.token, {
          embeds: [Preconditions.checkExists(interaction.message.embeds[0]), error.discordEmbed],
          components: interaction.message.components,
        });
        return;
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
      await this.showNeatQueueIntegrationConfig(interaction);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  // ============================================================================
  // Edit Methods - Edit Existing Integration
  // ============================================================================

  private async showEditIntegrationList(interaction: BaseInteraction, successMessage?: string): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(
      interaction.guild?.id ?? ("guild_id" in interaction ? interaction.guild_id : null),
    );

    try {
      const [neatQueues, channels] = await Promise.all([
        databaseService.findNeatQueueConfig({ GuildId: guildId }),
        discordService.getGuildChannels(guildId),
      ]);

      const fields: APIEmbedField[] = [];
      const components: APIActionRowComponent<APISelectMenuComponent | APIButtonComponentWithCustomId>[] = [];

      fields.push({
        name: "Existing NeatQueue Integrations",
        value: neatQueues.length
          ? neatQueues
              .map(
                (neatQueue) =>
                  `- <#${neatQueue.ChannelId}> (results: <#${neatQueue.ResultsChannelId}>): ${displayModeOptions.find((mode) => mode.value === neatQueue.PostSeriesMode.toString())?.label ?? "Unknown"}${neatQueue.PostSeriesChannelId != null ? ` into <#${neatQueue.PostSeriesChannelId}>` : ""}`,
              )
              .join("\\n")
          : "*None*",
      });

      if (neatQueues.length > 0) {
        components.push({
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: InteractionComponent.EditSelectChannel,
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
          {
            type: ComponentType.Button,
            custom_id: InteractionComponent.MainMenu,
            label: "Back to Main Menu",
            style: ButtonStyle.Secondary,
            emoji: { name: "🎛️" },
          },
        ],
      });

      const description = ["Select the NeatQueue integration you would like to edit."];
      if (successMessage != null) {
        description.unshift(`**\u2705 ${successMessage}**`);
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
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async showEditChannelOptions(
    interaction: APIMessageComponentSelectMenuInteraction,
    successMessage?: string,
  ): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild_id);
    const channelId = Preconditions.checkExists(interaction.data.values[0]);

    try {
      const config = await databaseService.getNeatQueueConfig(guildId, channelId);
      const formData = new Map<WizardStepKey, string>();
      formData.set(WizardStepKey.QueueChannel, channelId);
      formData.set(WizardStepKey.WebhookSecret, "****************");
      formData.set(WizardStepKey.HasResultsChannel, channelId !== config.ResultsChannelId ? "Yes" : "No");
      formData.set(WizardStepKey.ResultsChannel, config.ResultsChannelId);
      formData.set(WizardStepKey.DisplayMode, config.PostSeriesMode);
      if (config.PostSeriesChannelId != null) {
        formData.set(WizardStepKey.ResultsPostChannel, config.PostSeriesChannelId);
      }

      const description = [this.getWizardDescription(formData, "Current configuration:"), "What would you like to do?"];
      if (successMessage != null) {
        description.unshift(`**\u2705 ${successMessage}**`);
      }

      const options: APISelectMenuOption[] = [
        { label: "Change webhook secret", value: WizardStepKey.WebhookSecret },
        { label: "Change results channel", value: WizardStepKey.ResultsChannel },
        { label: "Change display mode", value: WizardStepKey.DisplayMode },
      ];

      if (config.PostSeriesMode === NeatQueuePostSeriesDisplayMode.CHANNEL) {
        options.push({ label: "Change stats post channel", value: WizardStepKey.ResultsPostChannel });
      }

      options.push({ label: "Delete integration", value: WizardStepKey.Delete });

      const setupEditNeatQueueChannelEmbed = new SetupEditNeatQueueChannelEmbed({
        channelId,
        description: description.join("\n\n"),
      });

      await discordService.updateDeferredReply(interaction.token, {
        embeds: [setupEditNeatQueueChannelEmbed.embed],
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: InteractionComponent.EditSelectOption,
                options,
              },
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                custom_id: InteractionComponent.EditBack,
                label: "Back",
                style: ButtonStyle.Secondary,
                emoji: { name: "🔙" },
              },
              {
                type: ComponentType.Button,
                custom_id: InteractionComponent.MainMenu,
                label: "Main Menu",
                style: ButtonStyle.Secondary,
                emoji: { name: "🎛️" },
              },
            ],
          },
        ],
      });
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private handleEditOptionSelect(interaction: APIMessageComponentSelectMenuInteraction): ExecuteResponse {
    const channelId = Preconditions.checkExists(
      interaction.message.embeds[0]?.title?.match(/<#(\d+)>/)?.[1],
      "Channel expected in title but not found",
    );

    const [value] = interaction.data.values;

    switch (value) {
      case WizardStepKey.WebhookSecret: {
        return {
          response: {
            type: InteractionResponseType.UpdateMessage,
            data: {
              embeds: [
                {
                  title: `Edit NeatQueue Integration for <#${channelId}>`,
                  description: [
                    "To update the webhook secret, follow these steps:",
                    ...this.webhookSecretInstructions,
                    "",
                    "5. Click the 🔐 Enter webhook secret button below",
                  ].join("\n"),
                  color: 0x337fd5,
                },
              ],
              components: [
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.Button,
                      custom_id: InteractionComponent.EditWebhookSecret,
                      label: "Enter webhook secret",
                      style: ButtonStyle.Primary,
                      emoji: { name: "🔐" },
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.Button,
                      custom_id: InteractionComponent.EditSelectChannel,
                      label: "Cancel",
                      style: ButtonStyle.Secondary,
                    },
                  ],
                },
              ],
            },
          },
        };
      }
      case WizardStepKey.ResultsChannel: {
        return {
          response: {
            type: InteractionResponseType.UpdateMessage,
            data: {
              embeds: [
                {
                  title: `Edit NeatQueue Integration for <#${channelId}>`,
                  description: "Select the channel where NeatQueue puts the results:",
                  color: 0x337fd5,
                },
              ],
              components: [
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.ChannelSelect,
                      custom_id: InteractionComponent.EditResultsChannel,
                      channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
                      min_values: 1,
                      max_values: 1,
                      placeholder: "Select the results channel",
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.Button,
                      custom_id: InteractionComponent.EditSelectChannel,
                      label: "Cancel",
                      style: ButtonStyle.Secondary,
                    },
                  ],
                },
              ],
            },
          },
        };
      }
      case WizardStepKey.DisplayMode: {
        return {
          response: {
            type: InteractionResponseType.UpdateMessage,
            data: {
              embeds: [
                {
                  title: `Edit NeatQueue Integration for <#${channelId}>`,
                  description: "How would you like to display the results?",
                  color: 0x337fd5,
                },
              ],
              components: [
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: InteractionComponent.EditDisplayMode,
                      options: displayModeOptions,
                      min_values: 1,
                      max_values: 1,
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.Button,
                      custom_id: InteractionComponent.EditSelectChannel,
                      label: "Cancel",
                      style: ButtonStyle.Secondary,
                    },
                  ],
                },
              ],
            },
          },
        };
      }
      case WizardStepKey.ResultsPostChannel: {
        return {
          response: {
            type: InteractionResponseType.UpdateMessage,
            data: {
              embeds: [
                {
                  title: `Edit NeatQueue Integration for <#${channelId}>`,
                  description: "Which channel should the results be posted in?",
                  color: 0x337fd5,
                },
              ],
              components: [
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.ChannelSelect,
                      custom_id: InteractionComponent.EditResultsPostChannel,
                      channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
                      min_values: 1,
                      max_values: 1,
                      placeholder: "Select the results post channel",
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.Button,
                      custom_id: InteractionComponent.EditSelectChannel,
                      label: "Cancel",
                      style: ButtonStyle.Secondary,
                    },
                  ],
                },
              ],
            },
          },
        };
      }
      case WizardStepKey.Delete: {
        return {
          response: {
            type: InteractionResponseType.UpdateMessage,
            data: {
              embeds: [
                {
                  title: `Delete NeatQueue Integration for <#${channelId}>`,
                  description: [
                    "To delete the NeatQueue Integration follow these steps:",
                    "1. Switch to the queue channel if you are not already there",
                    "2. Use NeatQueue's `/webhook delete` command",
                    "3. Click the \u2705 Confirm deletion button below to complete the deletion",
                  ].join("\\n"),
                  color: 0xff0000,
                },
              ],
              components: [
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.Button,
                      custom_id: InteractionComponent.EditDelete,
                      label: "Confirm deletion",
                      style: ButtonStyle.Danger,
                      emoji: { name: "\u2705" },
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.Button,
                      custom_id: InteractionComponent.EditSelectChannel,
                      label: "Cancel",
                      style: ButtonStyle.Secondary,
                    },
                  ],
                },
              ],
            },
          },
        };
      }
      case undefined:
      default: {
        throw new Error("Unknown edit option selected");
      }
    }
  }

  private handleEditWebhookSecretButton(): ExecuteResponse {
    return {
      response: {
        type: InteractionResponseType.Modal,
        data: {
          title: "Update Webhook Secret",
          custom_id: InteractionComponent.EditWebhookSecretModal,
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.TextInput,
                  custom_id: WizardStepKey.WebhookSecret,
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
    };
  }

  private async handleEditWebhookSecretModal(interaction: APIModalSubmitInteraction): Promise<void> {
    const { discordService, databaseService, neatQueueService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild_id);
    const channelId = Preconditions.checkExists(
      interaction.message?.embeds[0]?.title?.match(/<#(\d+)>/)?.[1],
      "Channel expected in title but not found",
    );

    try {
      const [submission] = interaction.data.components;
      if (submission?.type !== ComponentType.ActionRow) {
        throw new Error("Unexpected modal submission format");
      }

      const webhookSecret = Preconditions.checkExists(submission.components[0]?.value);
      const config = await databaseService.getNeatQueueConfig(guildId, channelId);
      config.WebhookSecret = neatQueueService.hashAuthorizationKey(webhookSecret, guildId);

      await databaseService.upsertNeatQueueConfig(config);

      // Create a fake select menu interaction to reuse the existing method
      const fakeInteraction = {
        ...interaction,
        data: {
          ...interaction.data,
          component_type: ComponentType.StringSelect,
          custom_id: InteractionComponent.EditSelectChannel,
          values: [channelId],
        },
      } as unknown as APIMessageComponentSelectMenuInteraction;

      await this.showEditChannelOptions(fakeInteraction, "Webhook secret updated");
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleEditField(
    interaction: APIMessageComponentSelectMenuInteraction,
    field: "ResultsChannelId" | "PostSeriesChannelId",
  ): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild_id);
    const channelId = Preconditions.checkExists(
      interaction.message.embeds[0]?.title?.match(/<#(\d+)>/)?.[1],
      "Channel expected in title but not found",
    );

    try {
      const newChannelId = Preconditions.checkExists(interaction.data.values[0]);
      const config = await databaseService.getNeatQueueConfig(guildId, channelId);
      config[field] = newChannelId;

      await databaseService.upsertNeatQueueConfig(config);

      const fakeInteraction = {
        ...interaction,
        data: {
          ...interaction.data,
          values: [channelId],
        },
      } as APIMessageComponentSelectMenuInteraction;

      const successMsg = field === "ResultsChannelId" ? "Results channel updated" : "Stats post channel updated";
      await this.showEditChannelOptions(fakeInteraction, successMsg);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleEditDisplayMode(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild_id);
    const channelId = Preconditions.checkExists(
      interaction.message.embeds[0]?.title?.match(/<#(\d+)>/)?.[1],
      "Channel expected in title but not found",
    );

    try {
      const newMode = Preconditions.checkExists(interaction.data.values[0]) as NeatQueuePostSeriesDisplayMode;
      const config = await databaseService.getNeatQueueConfig(guildId, channelId);
      config.PostSeriesMode = newMode;

      // Clear post channel if not using CHANNEL mode
      if (newMode !== NeatQueuePostSeriesDisplayMode.CHANNEL) {
        config.PostSeriesChannelId = null;
      }

      await databaseService.upsertNeatQueueConfig(config);

      const fakeInteraction = {
        ...interaction,
        data: {
          ...interaction.data,
          values: [channelId],
        },
      } as APIMessageComponentSelectMenuInteraction;

      await this.showEditChannelOptions(fakeInteraction, "Display mode updated");
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleDeleteIntegration(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild_id);
    const channelId = Preconditions.checkExists(
      interaction.message.embeds[0]?.title?.match(/<#(\d+)>/)?.[1],
      "Channel expected in title but not found",
    );

    try {
      await databaseService.deleteNeatQueueConfig(guildId, channelId);
      await this.showEditIntegrationList(interaction, `Integration for <#${channelId}> deleted`);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  // ============================================================================
  // Handler Methods - Clean separation of concerns
  // ============================================================================

  private async handleApplicationCommand(interaction: BaseInteraction): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild?.id, "No guild ID on interaction");

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

  private async handleSetupSelect(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    const [value] = interaction.data.values;

    switch (value) {
      case SetupSelectOption.StatsDisplayMode: {
        await this.showStatsDisplayModeConfig(interaction);
        break;
      }
      case SetupSelectOption.NeatQueueIntegration: {
        await this.showNeatQueueIntegrationConfig(interaction);
        break;
      }
      case SetupSelectOption.NeatQueueInformer: {
        await this.showNeatQueueInformerConfig(interaction);
        break;
      }
      case undefined:
      default: {
        await this.services.discordService.updateDeferredReply(interaction.token, {
          content: "Unknown option selected",
        });
      }
    }
  }

  private async handleMainMenu(interaction: BaseInteraction): Promise<void> {
    await this.handleApplicationCommand(interaction);
  }

  private async showStatsDisplayModeConfig(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
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

  private async handleUpdateStatsDisplayMode(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
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

  private async showNeatQueueIntegrationConfig(interaction: BaseInteraction): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(
      interaction.guild?.id ?? ("guild_id" in interaction ? interaction.guild_id : null),
    );
    const neatQueues = await databaseService.findNeatQueueConfig({ GuildId: guildId });

    const description = [
      "By configuring the NeatQueue integration, I can do things in an automated way, including:",
      "- Post series stats automatically after a series is completed",
      "- Work with Guilty Spark's NeatQueue Informer to post info when queues start and while they are in play",
    ].join("\n");

    const fields: APIEmbedField[] = [];
    const actions: APIButtonComponentWithCustomId[] = [
      {
        type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueIntegrationAdd,
        label: "Add NeatQueue integration",
        style: 1,
        emoji: { name: "➕" },
      },
    ];

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

      actions.push({
        type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueIntegrationEdit,
        label: "Edit existing NeatQueue integration",
        style: 2,
        emoji: { name: "🛠️" },
      });
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
          components: [
            {
              type: ComponentType.Button,
              custom_id: InteractionComponent.MainMenu,
              label: "Back to Main Menu",
              style: ButtonStyle.Secondary,
              emoji: { name: "🎛️" },
            },
          ],
        },
      ],
    };

    await discordService.updateDeferredReply(interaction.token, content);
  }

  private async showNeatQueueInformerConfig(interaction: BaseInteraction): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild?.id, "No guild ID on interaction");

    try {
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
              {
                type: ComponentType.Button,
                custom_id: InteractionComponent.NeatQueueInformerPlayersOnStart,
                label: "Toggle Player Connections",
                style: 1,
                emoji: { name: "🔌" },
              },
              {
                type: ComponentType.Button,
                custom_id: InteractionComponent.NeatQueueInformerLiveTracking,
                label: "Configure Live Tracking",
                style: 1,
                emoji: { name: "📊" },
              },
              {
                type: ComponentType.Button,
                custom_id: InteractionComponent.NeatQueueInformerMaps,
                label: "Configure maps generation",
                style: 1,
                emoji: { name: "🗺️" },
              },
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                custom_id: InteractionComponent.MainMenu,
                label: "Back to Main Menu",
                style: ButtonStyle.Secondary,
                emoji: { name: "🎛️" },
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

  private async handleTogglePlayerConnections(interaction: BaseInteraction): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild?.id, "No guild ID on interaction");

    try {
      const config = await databaseService.getGuildConfig(guildId, true);

      await databaseService.updateGuildConfig(guildId, {
        NeatQueueInformerPlayerConnections: config.NeatQueueInformerPlayerConnections === "Y" ? "N" : "Y",
      });

      // Re-show the informer config with updated state
      await this.showNeatQueueInformerConfig(interaction as APIMessageComponentSelectMenuInteraction);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleToggleLiveTracking(interaction: BaseInteraction): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild?.id, "No guild ID on interaction");

    try {
      const config = await databaseService.getGuildConfig(guildId, true);
      const newValue = config.NeatQueueInformerLiveTracking === "Y" ? "N" : "Y";

      await databaseService.updateGuildConfig(guildId, {
        NeatQueueInformerLiveTracking: newValue,
        // If disabling live tracking, also disable channel name updates
        ...(newValue === "N" && { NeatQueueInformerLiveTrackingChannelName: "N" }),
      });

      // Re-show the live tracking config with updated state
      await this.showLiveTrackingConfig(interaction as APIMessageComponentButtonInteraction);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleToggleChannelName(interaction: BaseInteraction): Promise<void> {
    const { discordService, databaseService } = this.services;
    const guildId = Preconditions.checkExists(interaction.guild?.id, "No guild ID on interaction");

    try {
      const config = await databaseService.getGuildConfig(guildId, true);

      await databaseService.updateGuildConfig(guildId, {
        NeatQueueInformerLiveTrackingChannelName: config.NeatQueueInformerLiveTrackingChannelName === "Y" ? "N" : "Y",
      });

      // Re-show the live tracking config with updated state
      await this.showLiveTrackingConfig(interaction as APIMessageComponentButtonInteraction);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async showLiveTrackingConfig(interaction: APIMessageComponentButtonInteraction): Promise<void> {
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
                custom_id: InteractionComponent.MainMenu,
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

  // ============================================================================
  // Maps Configuration Methods
  // ============================================================================

  private async showMapsConfig(
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
                  { label: "5", value: "5" },
                  { label: "7", value: "7" },
                  { label: "9", value: "9" },
                  { label: "11", value: "11" },
                  { label: "13", value: "13" },
                ],
                placeholder: "Configure count",
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

  private async handleUpdateMapsConfig(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
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
      await this.showMapsConfig(interaction);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  // ============================================================================
  // Helper Methods - Config Display
  // ============================================================================

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
}
