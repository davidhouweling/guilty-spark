import type {
  APIButtonComponent,
  APIEmbed,
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
import type { BaseInteraction, CommandData, ExecuteResponse } from "../base/base.mjs";
import { BaseCommand } from "../base/base.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import type { DiscordAssociationsRow } from "../../services/database/types/discord_associations.mjs";
import { AssociationReason, GamesRetrievable } from "../../services/database/types/discord_associations.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";

export enum InteractionButton {
  Confirm = "btn_connect_confirm",
  Change = "btn_connect_change",
  Remove = "btn_connect_remove",
  SearchConfirm = "btn_connect_search_confirm",
  SearchCancel = "btn_connect_search_cancel",
}

export const GamertagSearchModal = "gamertag_search_modal";

export class ConnectCommand extends BaseCommand {
  data: CommandData[] = [
    {
      type: ApplicationCommandType.ChatInput,
      name: "connect",
      description: "Connect your Discord account to your Halo account within Guilty Spark.",
      options: [],
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
        return this.messageComponentResponse(interaction);
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
      console.error(error);
      console.trace();

      if (error instanceof Error && error.message === "Too many subrequests.") {
        return;
      }

      await discordService.updateDeferredReply(interaction.token, {
        content: `Failed to connect: ${error instanceof Error ? error.message : "unknown"}`,
      });
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

    let currentAssociation = "**Halo account:** *No account connected*";
    let searchedGamertag = "";
    const actions: APIButtonComponent[] = [];
    const embeds: APIEmbed[] = [];

    if (association != null && association.GamesRetrievable === GamesRetrievable.YES) {
      const usersByXuids = await haloService.getUsersByXuids([association.XboxId]);
      if (usersByXuids[0] != null) {
        searchedGamertag = usersByXuids[0].gamertag;

        const thirdPartySites = [
          `[Halo Waypoint](<https://www.halowaypoint.com/halo-infinite/players/${searchedGamertag}>)`,
          `[Halo Data Hive](<https://halodatahive.com/Player/Infinite/${searchedGamertag}>)`,
          `[Halo Query](<https://haloquery.com/players/${searchedGamertag}>)`,
          `[Halo Tracker](<https://halotracker.com/halo-infinite/profile/xbl/${searchedGamertag}/overview>)`,
          `[Leaf App](<https://leafapp.co/player/${searchedGamertag}>)`,
          `[Spartan Record](<https://spartanrecord.com/service_record/${searchedGamertag}>)`,
        ];

        currentAssociation = [
          `**Halo account:** ${searchedGamertag}`,
          `**How:** ${discordService.getReadableAssociationReason(association.AssociationReason)}\n`,
          `View profile on: ${thirdPartySites.join(" | ")}`,
        ].join("\n");
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
        style: ButtonStyle.Secondary,
        label: "Connect new account",
        custom_id: InteractionButton.Change,
        emoji: { name: "🔗" },
      });
    }

    embeds.push({
      title: "Connect Discord to Halo",
      description:
        "Connecting your Discord account to Halo account, within Guilty Spark, allows Guilty Spark to find your matches and correctly track and report on series you have played.",
      fields: [
        {
          name: "What Guilty Spark knows",
          value: currentAssociation,
        },
      ],
    });

    if (association != null && association.GamesRetrievable === GamesRetrievable.YES) {
      const historyEmbed = await this.getHistoryEmbed(
        searchedGamertag,
        locale,
        "Recent game history",
        "Here are your most recent games:",
      );

      if (historyEmbed.fields && embeds[0]?.fields) {
        embeds[0].fields.push({ name: "**Recent matches**", value: "" }, ...historyEmbed.fields);
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
    const { databaseService, discordService } = this.services;
    const locale = interaction.guild_locale ?? interaction.locale;

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
      const content: RESTPostAPIWebhookWithTokenJSONBody = await this.interactionAssociateDiscordToHalo(
        association,
        locale,
      );

      await discordService.updateDeferredReply(interaction.token, content);
    } catch (error) {
      console.error(error);
      console.trace();

      if (error instanceof Error && error.message === "Too many subrequests.") {
        return;
      }

      await discordService.updateDeferredReply(interaction.token, {
        content: `Failed to update: ${error instanceof Error ? error.message : "unknown"}`,
      });
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
    } catch (error) {
      console.error(error);
      console.trace();

      if (error instanceof Error && error.message === "Too many subrequests.") {
        return;
      }

      await discordService.updateDeferredReply(interaction.token, {
        content: `Failed to remove: ${error instanceof Error ? error.message : "unknown"}`,
      });
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
        "Please confirm the recent game history for yourself below:",
      );

      const content: RESTPostAPIWebhookWithTokenJSONBody = {
        content: "",
        embeds: [historyEmbed],
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
        content: `Failed to fetch data: ${error instanceof Error ? error.message : "unknown"}`,
      });
    }
  }

  private async handleConfirmSearchButton(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    const { databaseService, discordService, haloService } = this.services;
    const locale = interaction.guild_locale ?? interaction.locale;

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
        },
      ]);

      const association = Preconditions.checkExists(
        await this.getAssociationFromInteraction(interaction),
        "Connection not found",
      );
      const content: RESTPostAPIWebhookWithTokenJSONBody = await this.interactionAssociateDiscordToHalo(
        association,
        locale,
      );

      await discordService.updateDeferredReply(interaction.token, content);
    } catch (error) {
      console.error(error);
      console.trace();

      if (error instanceof Error && error.message === "Too many subrequests.") {
        return;
      }

      await discordService.updateDeferredReply(interaction.token, {
        content: `Failed to update: ${error instanceof Error ? error.message : "unknown"}`,
      });
    }
  }

  private async getHistoryEmbed(
    gamertag: string,
    locale: string,
    title?: string,
    description?: string,
  ): Promise<APIEmbed> {
    const { discordService, haloService } = this.services;
    const recentHistory = await haloService.getRecentMatchHistory(gamertag);

    return {
      title: title ?? `Recent matches for "${gamertag}"`,
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
              value: recentHistory.map((match) => discordService.getTimestamp(match.MatchInfo.EndTime)).join("\n"),
              inline: true,
            },
          ]
        : [
            {
              name: "No matches found",
              value:
                "Please ensure that your [**Halo Waypoint Privacy settings**](https://www.halowaypoint.com/settings/privacy) are set to '**Show ...**' for both 'Halo Infinite matchmade games' and 'Halo Infinite Non-Matchmade Games'.",
            },
          ],
    };
  }
}
