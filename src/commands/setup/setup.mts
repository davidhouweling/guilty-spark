import type {
  APIModalInteractionResponse,
  APIActionRowComponent,
  APIEmbedField,
  APIMessageActionRowComponent,
  APIMessageComponentButtonInteraction,
  APIMessageComponentInteraction,
  APIMessageComponentSelectMenuInteraction,
  APIModalSubmitInteraction,
  RESTPostAPIWebhookWithTokenJSONBody,
  APIInteractionResponse,
} from "discord-api-types/v10";
import {
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
import type {
  NeatQueueConfigRow,
  NeatQueuePostSeriesDisplayMode,
} from "../../services/database/types/neat_queue_config.mjs";

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
  NeatQueueIntegrationAddWizardCancel = "setup_neat_queue_add_wizard_cancel",
  NeatQueueIntegrationEdit = "setup_neat_queue_edit",
}

const displayModeOptions = [
  { label: "Threaded message of the results", value: "T" },
  { label: "New message in results channel", value: "M" },
  { label: "New message in different channel", value: "C" },
];

enum NeatQueueIntegrationAddWizardStepKey {
  WebhookSecret = "webhook_secret",
  QueueChannel = "queue_channel",
  ResultsChannel = "results_channel",
  DisplayMode = "display_mode",
  ResultsPostChannel = "results_post_channel",
  Complete = "complete",
}
type NeatQueueIntegrationAddWizardStep = {
  key: NeatQueueIntegrationAddWizardStepKey;
  question: string;
  predicate?: (form: Map<NeatQueueIntegrationAddWizardStepKey, string>) => boolean;
} & (
  | {
      input: APIModalInteractionResponse;
      cta: string;
    }
  | {
      input: APIMessageActionRowComponent;
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

const NeatQueueIntegrationAddWizardSteps: NeatQueueIntegrationAddWizardStep[] = [
  {
    key: NeatQueueIntegrationAddWizardStepKey.WebhookSecret,
    question: "What is the webhook secret?",
    cta: "Enter webhook secret",
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
                custom_id: NeatQueueIntegrationAddWizardStepKey.WebhookSecret,
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
    key: NeatQueueIntegrationAddWizardStepKey.QueueChannel,
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
    key: NeatQueueIntegrationAddWizardStepKey.ResultsChannel,
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
  },
  {
    key: NeatQueueIntegrationAddWizardStepKey.DisplayMode,
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
    key: NeatQueueIntegrationAddWizardStepKey.ResultsPostChannel,
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
    predicate: (form) => form.get(NeatQueueIntegrationAddWizardStepKey.DisplayMode) === "C",
  },
  {
    key: NeatQueueIntegrationAddWizardStepKey.Complete,
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

export class SetupCommand extends BaseCommand {
  data: CommandData[] = [
    {
      type: ApplicationCommandType.ChatInput,
      name: "setup",
      description: "Setup Guilty Spark for your server",
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
        custom_id: InteractionComponent.NeatQueueIntegrationEdit,
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
        custom_id: InteractionComponent.MainMenu,
      },
    },
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

    if (interaction.member?.user.id !== "237222473500852224") {
      return {
        response: {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content:
              "This command is a WIP and is not available to you yet. Please reach out to <@237222473500852224> if you need help.",
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
          if (interaction.data.custom_id === InteractionComponent.NeatQueueIntegrationAddWizardNext.toString()) {
            return this.neatQueueIntegrationAddWizardNext(interaction);
          }

          throw new Error("Interaction not supported");
        }
        default: {
          throw new UnreachableError(type);
        }
      }
    } catch (error) {
      console.error(error);
      console.trace();

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
      case InteractionComponent.NeatQueueIntegrationEdit: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () =>
            this.setupNeatQueueIntegrationEditJob(interaction as APIMessageComponentButtonInteraction),
        };
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
      case InteractionComponent.NeatQueueIntegrationAddWizardCancel: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () => this.setupSelectNeatQueueIntegrationJob(interaction),
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setupNeatQueueIntegrationEditJob(_interaction: APIMessageComponentButtonInteraction): void | PromiseLike<void> {
    throw new Error("Method not implemented.");
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
      console.error(error);
      console.trace();

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
      console.error(error);
      console.trace();

      if (error instanceof Error && error.message === "Too many subrequests.") {
        return;
      }

      await discordService.updateDeferredReply(interaction.token, {
        content: `Failed to select stats display mode: ${error instanceof Error ? error.message : "unknown"}`,
      });
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
      console.error(error);
      console.trace();

      if (error instanceof Error && error.message === "Too many subrequests.") {
        return;
      }

      await discordService.updateDeferredReply(interaction.token, {
        content: `Failed to update stats display mode: ${error instanceof Error ? error.message : "unknown"}`,
      });
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

    const fields: APIEmbedField[] = [
      {
        name: "Adding a NeatQueue Integration",
        value: [
          "1. Switch to the channel with the queue that you wish to integrate with and run the NeatQueue command in your server: \n`/webhook add`.",
          `2. For the \`url\` option use: \n\`${this.env.HOST_URL}/api/neatqueue\``,
          "3. NeatQueue will reply with a webhook secret, copy it.",
          '4. Click the "Add NeatQueue integration" button, and follow the prompts.',
        ].join("\n"),
      },
    ];

    const actions: APIMessageActionRowComponent[] = [
      {
        type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueIntegrationAdd,
        label: "Add NeatQueue integration",
        style: ButtonStyle.Primary,
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
        style: ButtonStyle.Secondary,
      });
    }

    actions.push({
      type: ComponentType.Button,
      custom_id: InteractionComponent.MainMenu,
      label: "Back to Setup",
      style: ButtonStyle.Secondary,
    });

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
      ],
    };

    await discordService.updateDeferredReply(interaction.token, content);
  }

  private neatQueueIntegrationAddWizardBack(interaction: APIMessageComponentButtonInteraction): ExecuteResponse {
    const formData = this.wizardGetFormData(interaction);
    const stepData = Preconditions.checkExists(
      NeatQueueIntegrationAddWizardSteps[this.wizardGetStep(formData)],
      "Step data not found",
    );
    formData.delete(stepData.key);

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
    if (maybeResponse != null) {
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
  ): Map<NeatQueueIntegrationAddWizardStepKey, string> {
    const formData = new Map<NeatQueueIntegrationAddWizardStepKey, string>();

    if (interaction == null) {
      return formData;
    }

    const description = interaction.message?.embeds[0]?.description ?? "";

    for (const step of NeatQueueIntegrationAddWizardSteps) {
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
    formData: Map<NeatQueueIntegrationAddWizardStepKey, string>,
  ): APIInteractionResponse | undefined {
    if (interaction == null) {
      return;
    }

    if (interaction.type === InteractionType.ModalSubmit) {
      const { custom_id, value } = Preconditions.checkExists(interaction.data.components[0]?.components[0]);
      formData.set(custom_id as NeatQueueIntegrationAddWizardStepKey, value);
      return;
    }

    const { custom_id, component_type } = interaction.data;
    if (custom_id === InteractionComponent.NeatQueueIntegrationAddWizardNext.toString()) {
      switch (component_type) {
        case ComponentType.Button: {
          const step = this.wizardGetStep(formData);
          const stepData = Preconditions.checkExists(NeatQueueIntegrationAddWizardSteps[step]);
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
            return;
          }

          const step = this.wizardGetStep(formData);
          const stepData = Preconditions.checkExists(NeatQueueIntegrationAddWizardSteps[step]);
          formData.set(stepData.key, Preconditions.checkExists(interaction.data.values[0]));

          return;
        }
        default: {
          throw new UnreachableError(component_type);
        }
      }
    }

    return;
  }

  private wizardGetStep(formData: Map<NeatQueueIntegrationAddWizardStepKey, string>): number {
    for (let i = 0; i < NeatQueueIntegrationAddWizardSteps.length; i++) {
      const step = Preconditions.checkExists(NeatQueueIntegrationAddWizardSteps[i]);

      if (formData.has(step.key)) {
        continue;
      }

      if (step.predicate == null || step.predicate(formData)) {
        return i;
      }
    }

    return NeatQueueIntegrationAddWizardSteps.length;
  }

  private wizardHasNextStep(formData: Map<NeatQueueIntegrationAddWizardStepKey, string>): boolean {
    return this.wizardGetStep(formData) < NeatQueueIntegrationAddWizardSteps.length;
  }

  private wizardGetCta(stepData: NeatQueueIntegrationAddWizardStep): APIMessageActionRowComponent {
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

  private wizardGetDescription(formData: Map<string, string>): string {
    const description = ["Please follow the prompts to add a NeatQueue integration."];
    NeatQueueIntegrationAddWizardSteps.forEach((step, index) => {
      const value = formData.get(step.key);
      if (value != null) {
        const formatValue = step.format ? step.format(value) : value;
        description.push(`Step ${(index + 1).toLocaleString()}: ${step.question}: ${formatValue}`);
      }
    });

    return description.join("\n");
  }

  private wizardGetResponse(formData: Map<NeatQueueIntegrationAddWizardStepKey, string>): ExecuteResponse {
    const primaryActions: APIMessageActionRowComponent[] = [];
    const secondaryActions: APIMessageActionRowComponent[] = [];

    const step = this.wizardGetStep(formData);
    const stepData = Preconditions.checkExists(NeatQueueIntegrationAddWizardSteps[step]);
    primaryActions.push(this.wizardGetCta(stepData));

    if (step > 0) {
      secondaryActions.push({
        type: ComponentType.Button,
        custom_id: InteractionComponent.NeatQueueIntegrationAddWizardBack,
        label: "Back",
        style: ButtonStyle.Secondary,
      });
    }

    secondaryActions.push({
      type: ComponentType.Button,
      custom_id: InteractionComponent.NeatQueueIntegrationAddWizardCancel,
      label: "Cancel",
      style: ButtonStyle.Secondary,
    });
    secondaryActions.push({
      type: ComponentType.Button,
      custom_id: InteractionComponent.MainMenu,
      label: "Back to Main Menu",
      style: ButtonStyle.Secondary,
    });

    const components: APIActionRowComponent<APIMessageActionRowComponent>[] = [];
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
          description: this.wizardGetDescription(formData),
          fields: [
            {
              name: `Step ${(step + 1).toString()}`,
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

      const neatQueueConfig: NeatQueueConfigRow = {
        GuildId: guildId,
        ChannelId: Preconditions.checkExists(formData.get(NeatQueueIntegrationAddWizardStepKey.QueueChannel)),
        WebhookSecret: neatQueueService.hashAuthorizationKey(
          Preconditions.checkExists(formData.get(NeatQueueIntegrationAddWizardStepKey.WebhookSecret)),
          guildId,
        ),
        ResultsChannelId: Preconditions.checkExists(formData.get(NeatQueueIntegrationAddWizardStepKey.ResultsChannel)),
        PostSeriesMode: Preconditions.checkExists(
          formData.get(NeatQueueIntegrationAddWizardStepKey.DisplayMode),
        ) as NeatQueuePostSeriesDisplayMode,
        PostSeriesChannelId: formData.get(NeatQueueIntegrationAddWizardStepKey.ResultsPostChannel) ?? null,
      };

      await databaseService.upsertNeatQueueConfig(neatQueueConfig);

      await this.applicationCommandJob(interaction);
    } catch (error) {
      console.error(error);
      console.trace();

      if (error instanceof Error && error.message === "Too many subrequests.") {
        return;
      }

      await discordService.updateDeferredReply(interaction.token, {
        content: `Failed to save NeatQueue integration: ${error instanceof Error ? error.message : "unknown"}`,
      });
    }
  }
}
