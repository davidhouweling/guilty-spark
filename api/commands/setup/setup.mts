import type {
  APIEmbedField,
  RESTPostAPIWebhookWithTokenJSONBody,
  APIMessageComponentSelectMenuInteraction,
  APIButtonComponentWithCustomId,
  APIMessageComponentButtonInteraction,
} from "discord-api-types/v10";
import {
  InteractionContextType,
  ApplicationCommandType,
  ComponentType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  ButtonStyle,
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

enum SetupSelectOption {
  StatsDisplayMode = "stats_display_mode",
  NeatQueueIntegration = "neatqueue_integration",
  NeatQueueInformer = "neatqueue_informer",
}

enum SetupStatsDisplayModeOption {
  SeriesOnly = "series_only",
  SeriesAndGames = "series_games",
}

/**
 * Interaction component IDs for the setup command
 */
export enum InteractionComponent {
  SetupSelect = "setup_select",
  MainMenu = "setup_main_menu",
  SetupStatsDisplayMode = "setup_stats_display_mode",
  NeatQueueIntegrationAdd = "setup_neat_queue_add",
  NeatQueueIntegrationEdit = "setup_neat_queue_edit",
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

    [InteractionComponent.NeatQueueIntegrationAdd]: this.buttonHandler(() =>
      this.immediateResponse({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "NeatQueue integration add flow - to be implemented",
          flags: MessageFlags.Ephemeral,
        },
      }),
    ),

    [InteractionComponent.NeatQueueIntegrationEdit]: this.buttonHandler(() =>
      this.immediateResponse({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "NeatQueue integration edit flow - to be implemented",
          flags: MessageFlags.Ephemeral,
        },
      }),
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
      case InteractionType.MessageComponent:
      case InteractionType.ModalSubmit: {
        const customId = interaction.data.custom_id;
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

  private async showNeatQueueIntegrationConfig(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
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
          ...this.webhookSecretInstructions,
          `5. Click the "➕ Add NeatQueue integration" button below`,
          "6. Follow the prompts to provide me with the webhook secret and configure how you want the stats to be displayed",
        ].join("\n"),
      },
    ];

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
        value: neatQueues.map((neatQueue) => `- <#${neatQueue.ChannelId}>`).join("\n"),
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
              style: 2,
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
                style: 2,
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
