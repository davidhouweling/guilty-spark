import type {
  APIButtonComponent,
  APIEmbed,
  APIEmbedField,
  APIInteractionResponse,
  APIMessageComponentButtonInteraction,
  APIModalSubmitInteraction,
  RESTPostAPIWebhookWithTokenJSONBody,
} from "discord-api-types/v10";
import {
  TextInputStyle,
  ApplicationCommandType,
  InteractionResponseType,
  MessageFlags,
  ButtonStyle,
  ComponentType,
  InteractionType,
} from "discord-api-types/v10";
import { MatchType } from "halo-infinite-api";
import type { BaseInteraction, CommandData, ExecuteResponse } from "../base/base.mjs";
import { BaseCommand } from "../base/base.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import type { DiscordAssociationsRow } from "../../services/database/types/discord_associations.mjs";
import { AssociationReason, GamesRetrievable } from "../../services/database/types/discord_associations.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import { EndUserError } from "../../base/end-user-error.mjs";

export enum InteractionButton {
  Initiate = "btn_connect_initiate",
  Confirm = "btn_connect_confirm",
  Change = "btn_connect_change",
  Remove = "btn_connect_remove",
  SearchConfirm = "btn_connect_search_confirm",
  SearchCancel = "btn_connect_search_cancel",
}

export const GamertagSearchModal = "gamertag_search_modal";

export const ConfirmSuccessEmbed: APIEmbed = {
  title: "Discord account connected to Halo",
  description: "Your Discord account has been successfully connected to your Halo account.",
  color: 0x28a745, // Success green color
};

export class ConnectCommand extends BaseCommand {
  readonly data: CommandData[] = [
    {
      type: ApplicationCommandType.ChatInput,
      name: "connect",
      description: "Connect your Discord account to your Halo account within Guilty Spark.",
      default_member_permissions: null,
      options: [],
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionButton.Initiate,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionButton.Confirm,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionButton.Change,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionButton.Remove,
      },
    },
    {
      type: InteractionType.ModalSubmit,
      data: {
        components: [],
        custom_id: GamertagSearchModal,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionButton.SearchConfirm,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionButton.SearchCancel,
      },
    },
  ];

  override execute(interaction: BaseInteraction): ExecuteResponse {
    try {
      return this.handleCommand(interaction);
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

  private handleCommand(interaction: BaseInteraction): ExecuteResponse {
    const { type } = interaction;

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
        return this.messageComponentResponse(interaction as APIMessageComponentButtonInteraction);
      }
      case InteractionType.ModalSubmit: {
        return {
          response: {
            type: InteractionResponseType.UpdateMessage,
            data: {
              content: "",
              embeds: [
                {
                  title: `Gamertag search...`,
                  description: "Please wait while we search for your gamertag and recent game history...",
                },
              ],
              components: [
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.Button,
                      style: ButtonStyle.Success,
                      label: "Yes, this is me",
                      custom_id: InteractionButton.SearchConfirm,
                      emoji: { name: "👍" },
                      disabled: true,
                    },
                    {
                      type: ComponentType.Button,
                      style: ButtonStyle.Secondary,
                      label: "No, change search",
                      custom_id: InteractionButton.Change,
                      emoji: { name: "🔄" },
                      disabled: true,
                    },
                    {
                      type: ComponentType.Button,
                      style: ButtonStyle.Danger,
                      label: "Cancel",
                      custom_id: InteractionButton.SearchCancel,
                      emoji: { name: "🔙" },
                      disabled: true,
                    },
                  ],
                },
              ],
            },
          },
          jobToComplete: async () => this.handleModalSubmit(interaction),
        };
      }
      default: {
        throw new UnreachableError(type);
      }
    }
  }

  private async applicationCommandJob(interaction: BaseInteraction): Promise<void> {
    const { discordService } = this.services;
    const locale = interaction.guild_locale ?? interaction.locale;

    try {
      const association = await this.getAssociationFromInteraction(interaction);
      const content: RESTPostAPIWebhookWithTokenJSONBody = await this.interactionAssociateDiscordToHalo(
        association,
        locale,
      );

      await discordService.updateDeferredReply(interaction.token, content);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async getAssociationFromInteraction(
    interaction: BaseInteraction,
  ): Promise<DiscordAssociationsRow | undefined> {
    const { discordService, databaseService } = this.services;
    const discordId = discordService.getDiscordUserId(interaction);
    const discordAssociations = await databaseService.getDiscordAssociations([discordId]);
    const [association] = discordAssociations;

    return association;
  }

  private async interactionAssociateDiscordToHalo(
    association: DiscordAssociationsRow | undefined,
    locale: string,
  ): Promise<RESTPostAPIWebhookWithTokenJSONBody> {
    const { haloService, discordService } = this.services;

    let whatGuiltySparkKnowsField: APIEmbedField = {
      name: "What Guilty Spark knows",
      value: "**Halo account:** *No account connected*",
    };
    let searchedGamertag = "";
    const actions: APIButtonComponent[] = [];
    const embeds: APIEmbed[] = [];

    if (association != null && association.GamesRetrievable === GamesRetrievable.YES) {
      const usersByXuids = await haloService.getUsersByXuids([association.XboxId]);
      if (usersByXuids[0] != null) {
        searchedGamertag = usersByXuids[0].gamertag;
        whatGuiltySparkKnowsField = this.getWhatGuiltySparkKnowsField(searchedGamertag, association, discordService);
      }

      if (
        [
          AssociationReason.USERNAME_SEARCH,
          AssociationReason.DISPLAY_NAME_SEARCH,
          AssociationReason.GAME_SIMILARITY,
        ].includes(association.AssociationReason)
      ) {
        actions.push({
          type: ComponentType.Button,
          style: ButtonStyle.Primary,
          label: "Yes, this is correct",
          custom_id: InteractionButton.Confirm,
          emoji: { name: "👍" },
        });
      }

      if (
        [
          AssociationReason.CONNECTED,
          AssociationReason.MANUAL,
          AssociationReason.USERNAME_SEARCH,
          AssociationReason.DISPLAY_NAME_SEARCH,
          AssociationReason.GAME_SIMILARITY,
        ].includes(association.AssociationReason)
      ) {
        actions.push({
          type: ComponentType.Button,
          style: ButtonStyle.Secondary,
          label: "Change",
          custom_id: InteractionButton.Change,
          emoji: { name: "🔄" },
        });
      }

      actions.push({
        type: ComponentType.Button,
        style: ButtonStyle.Danger,
        label: "Remove",
        custom_id: InteractionButton.Remove,
        emoji: { name: "🗑️" },
      });
    } else {
      actions.push({
        type: ComponentType.Button,
        style: ButtonStyle.Primary,
        label: "Connect new account",
        custom_id: InteractionButton.Change,
        emoji: { name: "🔗" },
      });
    }

    embeds.push({
      title: "Connect Discord to Halo",
      description: [
        "Connecting your Discord account to Halo account, within Guilty Spark, allows Guilty Spark to find your matches and correctly track and report on series you have played.",
        "",
        "Click the button below to search for your gamertag and recent game history.",
      ].join("\n"),
      fields: [whatGuiltySparkKnowsField],
    });

    if (association != null && association.GamesRetrievable === GamesRetrievable.YES) {
      const historyEmbed = await this.getHistoryEmbed(
        searchedGamertag,
        locale,
        "Recent game history",
        "Here are your most recent games:",
      );
      const hasHistory = historyEmbed.fields != null && historyEmbed.fields.length > 1;

      if (historyEmbed.fields && embeds[0]?.fields) {
        embeds[0].fields.push({ name: "**Recent custom games**", value: "" }, ...historyEmbed.fields);
      }

      if (!hasHistory) {
        actions.splice(
          0,
          actions.length,
          {
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            label: "Try again (Search)",
            custom_id: InteractionButton.Change,
            emoji: { name: "🔄" },
          },
          {
            type: ComponentType.Button,
            style: ButtonStyle.Danger,
            label: "Remove",
            custom_id: InteractionButton.Remove,
            emoji: { name: "🗑️" },
          },
        );
      }
    }

    return {
      content: "",
      embeds,
      components: [
        {
          type: ComponentType.ActionRow,
          components: actions,
        },
      ],
    };
  }

  private messageComponentResponse(interaction: APIMessageComponentButtonInteraction): ExecuteResponse {
    const { custom_id } = interaction.data;

    switch (custom_id as InteractionButton) {
      case InteractionButton.Initiate: {
        return {
          response: {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              flags: MessageFlags.Ephemeral,
              embeds: [
                {
                  title: "Gamertag search...",
                  description: "Searching for your gamertag and recent game history...",
                },
              ],
            },
          },
          jobToComplete: async () => this.applicationCommandJob(interaction),
        };
      }
      case InteractionButton.Confirm: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () => this.handleConfirmButton(interaction),
        };
      }
      case InteractionButton.Change: {
        return {
          response: this.handleChangeButton(),
        };
      }
      case InteractionButton.Remove: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () => this.handleRemoveButton(interaction),
        };
      }
      case InteractionButton.SearchConfirm: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () => this.handleConfirmSearchButton(interaction),
        };
      }
      case InteractionButton.SearchCancel: {
        return {
          response: {
            type: InteractionResponseType.DeferredMessageUpdate,
          },
          jobToComplete: async () => this.applicationCommandJob(interaction),
        };
      }
      default: {
        throw new Error(`Unknown custom_id: ${custom_id}`);
      }
    }
  }

  private async handleConfirmButton(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;

    try {
      const oldAssociation = Preconditions.checkExists(
        await this.getAssociationFromInteraction(interaction),
        "Connection not found",
      );
      await databaseService.upsertDiscordAssociations([
        {
          ...oldAssociation,
          AssociationReason: AssociationReason.MANUAL,
        },
      ]);

      const association = Preconditions.checkExists(
        await this.getAssociationFromInteraction(interaction),
        "Connection not found",
      );

      const usersByXuids = await haloService.getUsersByXuids([association.XboxId]);
      const searchedGamertag = Preconditions.checkExists(usersByXuids[0]?.gamertag, "Expected gamertag");
      const content: RESTPostAPIWebhookWithTokenJSONBody = {
        embeds: [
          {
            ...ConfirmSuccessEmbed,
            fields: [this.getWhatGuiltySparkKnowsField(searchedGamertag, association, discordService)],
          },
        ],
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                style: ButtonStyle.Secondary,
                label: "Back",
                custom_id: InteractionButton.SearchCancel,
                emoji: { name: "🔙" },
              },
            ],
          },
        ],
      };

      await Promise.all([
        discordService.updateDeferredReply(interaction.token, content),
        this.maybeRetryLastCommand(interaction),
      ]);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private handleChangeButton(): APIInteractionResponse {
    const content: APIInteractionResponse = {
      type: InteractionResponseType.Modal,
      data: {
        title: "Gamertag search",
        custom_id: GamertagSearchModal,
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.TextInput,
                custom_id: "gamertag",
                label: "Gamertag",
                style: TextInputStyle.Short,
                min_length: 1,
                max_length: 100,
                placeholder: "Enter your Xbox/Halo gamertag",
                required: true,
              },
            ],
          },
        ],
      },
    };

    return content;
  }

  private async handleRemoveButton(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { databaseService, discordService } = this.services;
    const locale = interaction.guild_locale ?? interaction.locale;

    try {
      const discordId = discordService.getDiscordUserId(interaction);
      await databaseService.deleteDiscordAssociations([discordId]);

      const association = await this.getAssociationFromInteraction(interaction);
      const content: RESTPostAPIWebhookWithTokenJSONBody = await this.interactionAssociateDiscordToHalo(
        association,
        locale,
      );

      await discordService.updateDeferredReply(interaction.token, content);
      await this.maybeRetryLastCommand(interaction);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleModalSubmit(interaction: APIModalSubmitInteraction): Promise<void> {
    const { discordService } = this.services;

    try {
      if (interaction.data.custom_id !== GamertagSearchModal) {
        throw new Error(`Unknown custom_id: ${interaction.data.custom_id}`);
      }

      const locale = interaction.guild_locale ?? interaction.locale;
      const modalData = discordService.extractModalSubmitData(interaction);
      const gamertag = Preconditions.checkExists(modalData.get("gamertag"), "Gamertag is required");
      const historyEmbed = await this.getHistoryEmbed(
        gamertag,
        locale,
        `Gamertag search for "${gamertag}"`,
        "Please confirm the recent custom game history for yourself below:",
      );
      const hasHistory = historyEmbed.fields != null && historyEmbed.fields.length > 1;
      const actions: APIButtonComponent[] = hasHistory
        ? [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              label: "Yes, this is me",
              custom_id: InteractionButton.SearchConfirm,
              emoji: { name: "👍" },
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              label: "No, change search",
              custom_id: InteractionButton.Change,
              emoji: { name: "🔄" },
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Danger,
              label: "Cancel",
              custom_id: InteractionButton.SearchCancel,
              emoji: { name: "🔙" },
            },
          ]
        : [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              label: "Try again",
              custom_id: InteractionButton.Change,
              emoji: { name: "🔄" },
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Danger,
              label: "Cancel",
              custom_id: InteractionButton.SearchCancel,
              emoji: { name: "🔙" },
            },
          ];

      const content: RESTPostAPIWebhookWithTokenJSONBody = {
        content: "",
        embeds: [historyEmbed],
        components: [
          {
            type: ComponentType.ActionRow,
            components: actions,
          },
        ],
      };

      await discordService.updateDeferredReply(interaction.token, content);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleConfirmSearchButton(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;

    try {
      const discordId = discordService.getDiscordUserId(interaction);
      const embedTitle = Preconditions.checkExists(interaction.message.embeds[0]?.title, "Embed title is required");

      const gamerTagFromTitle = /"([^"]+)"/.exec(embedTitle)?.[1];
      if (gamerTagFromTitle == null) {
        throw new Error("Gamertag not found in embed title");
      }
      const user = await haloService.getUserByGamertag(gamerTagFromTitle);

      await databaseService.upsertDiscordAssociations([
        {
          DiscordId: discordId,
          XboxId: user.xuid,
          GamesRetrievable: GamesRetrievable.YES,
          AssociationReason: AssociationReason.MANUAL,
          AssociationDate: new Date().getTime(),
          DiscordDisplayNameSearched: null,
        },
      ]);

      const association = Preconditions.checkExists(
        await this.getAssociationFromInteraction(interaction),
        "Connection not found",
      );
      const usersByXuids = await haloService.getUsersByXuids([association.XboxId]);
      const searchedGamertag = Preconditions.checkExists(usersByXuids[0]?.gamertag, "Expected gamertag");
      const content: RESTPostAPIWebhookWithTokenJSONBody = {
        embeds: [
          {
            ...ConfirmSuccessEmbed,
            fields: [this.getWhatGuiltySparkKnowsField(searchedGamertag, association, discordService)],
          },
        ],
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                style: ButtonStyle.Secondary,
                label: "Back",
                custom_id: InteractionButton.SearchCancel,
                emoji: { name: "🔙" },
              },
            ],
          },
        ],
      };

      await Promise.all([
        discordService.updateDeferredReply(interaction.token, content),
        this.maybeRetryLastCommand(interaction),
      ]);
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private getWhatGuiltySparkKnowsField(
    searchedGamertag: string,
    association: DiscordAssociationsRow,
    discordService: typeof this.services.discordService,
  ): APIEmbedField {
    const url = new URL(`https://halodatahive.com/Player/Infinite/${searchedGamertag}`);
    const thirdPartySites = [`[Halo Data Hive](<${url.href}>)`];
    return {
      name: "What Guilty Spark knows",
      value: [
        `**Halo account:** ${searchedGamertag}`,
        `**How:** ${discordService.getReadableAssociationReason(association)}\n`,
        `View profile on: ${thirdPartySites.join(" | ")}`,
      ].join("\n"),
    };
  }

  private async getHistoryEmbed(
    gamertag: string,
    locale: string,
    title?: string,
    description?: string,
  ): Promise<APIEmbed> {
    const { discordService, haloService } = this.services;
    const recentHistory = await haloService.getRecentMatchHistory(gamertag, MatchType.Custom);

    return {
      title: title ?? `Recent custom game matches for "${gamertag}"`,
      description: description ?? "",
      fields: recentHistory.length
        ? [
            {
              name: "Game",
              value: (
                await Promise.all(
                  recentHistory.map(async (match) => await haloService.getGameTypeAndMap(match.MatchInfo)),
                )
              ).join("\n"),
              inline: true,
            },
            {
              name: "Result",
              value: (
                await Promise.all(
                  recentHistory.map(async (match) => {
                    const outcome = haloService.getMatchOutcome(match.Outcome);
                    const [matchDetail] = await haloService.getMatchDetails([match.MatchId]);
                    const matchScore = haloService.getMatchScore(
                      Preconditions.checkExists(matchDetail, `Cannot find match with match id ${match.MatchId}`),
                      locale,
                    );

                    return `${outcome} - ${matchScore}`;
                  }),
                )
              ).join("\n"),
              inline: true,
            },
            {
              name: "When",
              value: recentHistory.map((match) => discordService.getTimestamp(match.MatchInfo.EndTime, "R")).join("\n"),
              inline: true,
            },
          ]
        : [
            {
              name: "No custom game matches found",
              value: [
                "To resolve, either:",
                'In game: open Settings, navigate to Accessibility tab, scroll down to Match History Privacy, set the "Matchmade Games" option to "Share", and set the "Non-Matchmade Games" option to "Share".',
                'Go to [**Halo Waypoint Privacy settings**](https://www.halowaypoint.com/settings/privacy): select "Show Matchmade Game History" and "Show Non-Matchmade Game History".',
                "",
                "Once you have done this, search for your gamertag again.",
              ].join("\n"),
            },
          ],
    };
  }

  private async maybeRetryLastCommand(interaction: BaseInteraction): Promise<void> {
    const { discordService, neatQueueService } = this.services;
    const messageReference = interaction.message?.message_reference;

    if (messageReference?.message_id == null) {
      return;
    }

    try {
      const message = await discordService.getMessage(messageReference.channel_id, messageReference.message_id);

      if (message.embeds.length === 0) {
        return;
      }

      if (message.embeds[0]?.title === "Players in queue") {
        await neatQueueService.updatePlayersEmbed(
          Preconditions.checkExists(interaction.guild?.id, "expected guild id"),
          message.channel_id,
          message.id,
        );

        return;
      }

      const errorEmbed = message.embeds
        .map((embed) => EndUserError.fromDiscordEmbed(embed))
        .find((embed) => embed != null);

      if (errorEmbed == null || !(errorEmbed instanceof EndUserError) || Object.entries(errorEmbed.data).length === 0) {
        return;
      }

      if (errorEmbed.callbackType === "stats") {
        await neatQueueService.handleRetry({
          errorEmbed,
          guildId: Preconditions.checkExists(interaction.guild_id, "expected guild id"),
          message,
        });
      }
    } catch (error) {
      await discordService.updateDeferredReplyWithError(interaction.token, error as Error);
    }
  }
}
