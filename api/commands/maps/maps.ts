import type {
  APIApplicationCommandInteraction,
  APIInteractionResponseCallbackData,
  APIMessageComponentButtonInteraction,
  APIMessageComponentSelectMenuInteraction,
} from "discord-api-types/v10";
import {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  InteractionResponseType,
  InteractionType,
} from "discord-api-types/v10";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { z } from "zod";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error";
import { BaseCommand } from "../base/base-command";
import type {
  ExecuteResponse,
  BaseInteraction,
  ApplicationCommandData,
  ComponentHandlerMap,
} from "../base/base-command";
import type { MapMode } from "../../services/halo/hcs";
import { MAP_COUNTS } from "../../services/halo/hcs";
import { MapsEmbed, InteractionComponent, mapPlaylistLabels, mapFormatLabels } from "../../embeds/maps-embed";
import { MapsFormatType, MapsPlaylistType } from "../../services/database/types/guild_config";
import type { LiveTrackerContext } from "../../services/live-tracker/live-tracker";
import { normalizeMapsFormat, readMapsDraftFromMessage } from "./maps-draft";
import type { MapsDraft } from "./maps-draft";
const mapsPlaylistSchema = z.enum(MapsPlaylistType);
const mapsFormatSchema = z.enum(MapsFormatType);

export class MapsCommand extends BaseCommand {
  readonly commands: ApplicationCommandData[] = [
    {
      type: ApplicationCommandType.ChatInput,
      name: "maps",
      description: "Generate a random set of Halo maps (default: LVT Pro League)",
      default_member_permissions: null,
      options: [
        {
          type: ApplicationCommandOptionType.Integer,
          name: "count",
          description: "Number of maps to generate",
          required: false,
          choices: MAP_COUNTS.map((count) => ({ name: count.toString(), value: count })),
        },
        {
          type: ApplicationCommandOptionType.String,
          name: "playlist",
          description: "Which playlist to use (default: LVT Pro League - Current)",
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

  protected override readonly components: ComponentHandlerMap = this.createHandlerMap(InteractionComponent, {
    [InteractionComponent.Initiate]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.handleInitiate(interaction)),
    ),

    [InteractionComponent.Regenerate]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.handleRegenerate(interaction)),
    ),

    [InteractionComponent.Confirm]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.handleConfirm(interaction)),
    ),

    [InteractionComponent.Clear]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.handleClear(interaction)),
    ),

    [InteractionComponent.ConfirmClear]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.handleConfirmClear(interaction)),
    ),

    [InteractionComponent.CancelClear]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.handleCancelClear(interaction)),
    ),

    [InteractionComponent.CountSelect]: this.stringSelectHandler((interaction) =>
      this.deferUpdate(async () => this.handleCountSelect(interaction)),
    ),

    [InteractionComponent.PlaylistSelect]: this.stringSelectHandler((interaction) =>
      this.deferUpdate(async () => this.handlePlaylistSelect(interaction)),
    ),

    [InteractionComponent.FormatSelect]: this.stringSelectHandler((interaction) =>
      this.deferUpdate(async () => this.handleFormatSelect(interaction)),
    ),

    [InteractionComponent.Repost]: this.buttonHandler((interaction) =>
      this.deferUpdate(async () => this.handleRepost(interaction)),
    ),
  });

  protected handleInteraction(interaction: BaseInteraction): ExecuteResponse {
    const { type } = interaction;

    switch (type) {
      case InteractionType.ApplicationCommand: {
        return this.applicationCommandJob(interaction);
      }
      case InteractionType.MessageComponent: {
        const customId = interaction.data.custom_id;
        const handler = this.components[customId];

        if (!handler) {
          throw new Error(`No handler found for component: ${customId}`);
        }

        return this.executeComponentHandler(handler, interaction);
      }
      case InteractionType.ModalSubmit: {
        throw new Error("This command cannot be used in this context.");
      }
      default:
        throw new UnreachableError(type);
    }
  }

  private generateDeferredResponse(
    interaction: APIApplicationCommandInteraction,
    state: { count: number; playlist: MapsPlaylistType; format: MapsFormatType },
    mapsPromise: Promise<{ mode: MapMode; map: string }[]>,
  ): ExecuteResponse {
    return {
      response: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
      },
      jobToComplete: async (): Promise<void> => {
        const { discordService, logService } = this.services;
        try {
          const maps = await mapsPromise;
          const availableModes = await this.services.haloService.getMapModesForPlaylist(state.playlist);
          const draft = this.createDraft(
            interaction,
            { ...state, format: normalizeMapsFormat(state.format, availableModes) },
            maps,
          );
          await discordService.updateDeferredReply(interaction.token, this.createMapsResponse(draft, availableModes));
        } catch (error) {
          logService.error(error);
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
    const playlist =
      playlistOption?.type === ApplicationCommandOptionType.String
        ? mapsPlaylistSchema.parse(playlistOption.value)
        : MapsPlaylistType.HCS_CURRENT;

    const formatOption = options?.find((opt) => opt.name === "format");
    const format =
      formatOption?.type === ApplicationCommandOptionType.String
        ? mapsFormatSchema.parse(formatOption.value)
        : MapsFormatType.HCS;

    const state = { count, playlist, format };
    const maps = this.services.haloService.generateMaps(state);

    return this.generateDeferredResponse(interaction, state, maps);
  }

  private async handleInitiate(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    try {
      const guildId = Preconditions.checkExists(interaction.guild_id, "expected guild id");
      const guildConfig = await this.services.databaseService.getGuildConfig(guildId);
      const state = {
        count: guildConfig.NeatQueueInformerMapsCount,
        playlist: guildConfig.NeatQueueInformerMapsPlaylist,
        format: guildConfig.NeatQueueInformerMapsFormat,
      };
      const maps = await this.services.haloService.generateMaps(state);
      const availableModes = await this.services.haloService.getMapModesForPlaylist(state.playlist);
      const draft = this.createDraft(
        interaction,
        { ...state, format: normalizeMapsFormat(state.format, availableModes) },
        maps,
      );
      await this.services.discordService.createMessage(
        interaction.channel.id,
        this.createMapsResponse(draft, availableModes),
      );
    } catch (error) {
      this.services.logService.error(error);
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleRegenerate(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    try {
      const previousDraft = this.getEditableDraft(interaction);
      const draft = { ...previousDraft, ...(await this.generateMapValues(previousDraft)) };
      await this.updateDraftMessage(interaction, draft);
    } catch (error) {
      this.services.logService.error(error);
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleCountSelect(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    try {
      const previousDraft = this.getEditableDraft(interaction);
      const selectedCount = Number(Preconditions.checkExists(interaction.data.values[0], "expected map count"));
      if (!MAP_COUNTS.includes(selectedCount)) {
        throw new Error("Unknown map count");
      }
      const state = { ...previousDraft, count: selectedCount };
      const draft = { ...state, ...(await this.generateMapValues(state)) };
      await this.updateDraftMessage(interaction, draft);
    } catch (error) {
      this.services.logService.error(error);
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handlePlaylistSelect(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    try {
      const previousDraft = this.getEditableDraft(interaction);
      const selectedPlaylist = Preconditions.checkExists(interaction.data.values[0], "expected map playlist");
      const playlist = mapsPlaylistSchema.parse(selectedPlaylist);
      const availableModes = await this.services.haloService.getMapModesForPlaylist(playlist);
      const format = normalizeMapsFormat(previousDraft.format, availableModes);
      const state = { ...previousDraft, playlist, format };
      const draft = { ...state, ...(await this.generateMapValues(state)) };
      await this.updateDraftMessage(interaction, draft, availableModes);
    } catch (error) {
      this.services.logService.error(error);
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleFormatSelect(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    try {
      const previousDraft = this.getEditableDraft(interaction);
      const selectedFormat = Preconditions.checkExists(interaction.data.values[0], "expected map format");
      const format = mapsFormatSchema.parse(selectedFormat);
      const state = { ...previousDraft, format };
      const draft = { ...state, ...(await this.generateMapValues(state)) };
      await this.updateDraftMessage(interaction, draft);
    } catch (error) {
      this.services.logService.error(error);
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleRepost(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    try {
      const draft = this.getDraft(interaction);
      const availableModes = await this.services.haloService.getMapModesForPlaylist(draft.playlist);
      const response = this.createMapsResponse(draft, availableModes);
      await this.services.discordService.createMessage(interaction.channel.id, {
        ...response,
        content: interaction.message.content,
      });

      await this.services.discordService.deleteMessage(
        interaction.channel.id,
        interaction.message.id,
        "Reposting maps",
      );
    } catch (error) {
      this.services.logService.error(error);
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleConfirm(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    try {
      const draft = this.getDraft(interaction);
      if (draft.maps.length === 0) {
        throw new EndUserError("Select or generate maps before confirming them.", {
          errorType: EndUserErrorType.WARNING,
          handled: true,
        });
      }
      const availableModes = await this.services.haloService.getMapModesForPlaylist(draft.playlist);
      if (!draft.locked) {
        draft.userId = this.getInteractionUserId(interaction);
        const context = await this.getActiveQueueContext(interaction);
        if (context != null) {
          const token = crypto.randomUUID();
          const wasClearedByUser = await this.services.liveTrackerService.setPlannedMaps(context, draft.maps, token);
          draft.plan = { queueNumber: context.queueNumber, token };
          try {
            await this.services.discordService.updateDeferredReply(
              interaction.token,
              this.createMapsResponse({ ...draft, locked: true }, availableModes),
            );
          } catch (error) {
            try {
              await this.services.liveTrackerService.clearPlannedMaps(context, token, wasClearedByUser);
            } catch (rollbackError) {
              this.services.logService.error(rollbackError);
            }
            throw error;
          }
          return;
        }
      }

      await this.services.discordService.updateDeferredReply(
        interaction.token,
        this.createMapsResponse({ ...draft, locked: true }, availableModes),
      );
    } catch (error) {
      this.services.logService.error(error);
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleClear(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    try {
      const draft = this.getDraft(interaction);
      const availableModes = await this.services.haloService.getMapModesForPlaylist(draft.playlist);
      await this.services.discordService.updateDeferredReply(
        interaction.token,
        this.createMapsResponse(draft, availableModes, {
          clearConfirmation: true,
          clearConfirmationUserId: this.getInteractionUserId(interaction),
        }),
      );
    } catch (error) {
      this.services.logService.error(error);
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleConfirmClear(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    try {
      const draft = this.getDraft(interaction);
      const availableModes = await this.services.haloService.getMapModesForPlaylist(draft.playlist);
      if (draft.plan != null || draft.autoQueueNumber != null) {
        const context: LiveTrackerContext = {
          userId: this.getInteractionUserId(interaction),
          guildId: Preconditions.checkExists(interaction.guild_id, "expected guild id"),
          channelId: interaction.channel.id,
          queueNumber: draft.plan?.queueNumber ?? Preconditions.checkExists(draft.autoQueueNumber),
        };
        const token = draft.plan?.token ?? crypto.randomUUID();
        const cleared = await this.services.liveTrackerService.clearPlannedMaps(context, token, true);
        if (!cleared) {
          throw new EndUserError("These maps are no longer the queue's current plan.", {
            errorType: EndUserErrorType.WARNING,
            handled: true,
          });
        }
      }

      await this.services.discordService.updateDeferredReply(
        interaction.token,
        this.createMapsResponse(
          {
            ...draft,
            userId: this.getInteractionUserId(interaction),
            locked: false,
            maps: [],
            plan: undefined,
            attributionLabel: "Cleared by",
          },
          availableModes,
        ),
      );
    } catch (error) {
      this.services.logService.error(error);
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error, {
        preserveMessage: interaction.message,
      });
    }
  }

  private async handleCancelClear(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    try {
      const draft = this.getDraft(interaction);
      const availableModes = await this.services.haloService.getMapModesForPlaylist(draft.playlist);
      await this.services.discordService.updateDeferredReply(
        interaction.token,
        this.createMapsResponse(draft, availableModes),
      );
    } catch (error) {
      this.services.logService.error(error);
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private createDraft(
    interaction: APIApplicationCommandInteraction | APIMessageComponentButtonInteraction,
    state: { count: number; playlist: MapsPlaylistType; format: MapsFormatType },
    maps: { mode: MapMode; map: string }[],
  ): MapsDraft {
    return {
      userId: this.getInteractionUserId(interaction),
      locked: false,
      ...state,
      maps,
    };
  }

  private async generateMapValues(
    state: Pick<MapsDraft, "count" | "playlist" | "format">,
  ): Promise<{ maps: { mode: MapMode; map: string }[] }> {
    return {
      maps: await this.services.haloService.generateMaps({
        count: state.count,
        playlist: state.playlist,
        format: state.format,
      }),
    };
  }

  private getDraft(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): MapsDraft {
    return readMapsDraftFromMessage(interaction.message);
  }

  private getEditableDraft(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): MapsDraft {
    const draft = this.getDraft(interaction);
    if (draft.locked) {
      throw new EndUserError("These maps are confirmed. Run `/maps` to create a new set.", {
        errorType: EndUserErrorType.WARNING,
        handled: true,
      });
    }
    return draft;
  }

  private async getActiveQueueContext(
    interaction: APIMessageComponentButtonInteraction,
  ): Promise<LiveTrackerContext | null> {
    const guildId = interaction.guild_id;
    if (guildId == null) {
      return null;
    }

    let queueNumber: number;
    try {
      const queueData = await this.services.discordService.getTeamsFromQueueChannel(guildId, interaction.channel.id);
      if (queueData == null) {
        return null;
      }
      queueNumber = queueData.queue;
    } catch (error) {
      if (error instanceof EndUserError && error.errorType === EndUserErrorType.WARNING) {
        return null;
      }
      throw error;
    }

    return {
      userId: this.getInteractionUserId(interaction),
      guildId,
      channelId: interaction.channel.id,
      queueNumber,
    };
  }

  private async updateDraftMessage(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
    draft: MapsDraft,
    availableModes?: MapMode[],
  ): Promise<void> {
    const modes = availableModes ?? (await this.services.haloService.getMapModesForPlaylist(draft.playlist));
    if (draft.attributionLabel === "Cleared by" && draft.maps.length > 0) {
      draft.attributionLabel = "Generated by";
      draft.userId = this.getInteractionUserId(interaction);
    }
    await this.services.discordService.updateDeferredReply(interaction.token, this.createMapsResponse(draft, modes));
  }

  private getInteractionUserId(
    interaction:
      | APIApplicationCommandInteraction
      | APIMessageComponentButtonInteraction
      | APIMessageComponentSelectMenuInteraction,
  ): string {
    return Preconditions.checkExists(
      interaction.member?.user.id ?? interaction.user?.id,
      "expected either an interaction member id or user id but none found",
    );
  }

  private createMapsResponse(
    draft: MapsDraft,
    availableModes: MapMode[],
    options: {
      clearConfirmation?: boolean | undefined;
      clearConfirmationUserId?: string | undefined;
    } = {},
  ): APIInteractionResponseCallbackData {
    const mapsEmbed = new MapsEmbed(
      { discordService: this.services.discordService },
      { ...draft, ...options, availableModes },
    );

    return mapsEmbed.toMessageData();
  }
}
