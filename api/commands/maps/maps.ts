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

export interface MapsDraft {
  userId: string;
  count: number;
  playlist: MapsPlaylistType;
  format: MapsFormatType;
  maps: { mode: MapMode; map: string }[];
}

export const MAP_DRAFT_TTL_SECONDS = 60 * 60 * 6;
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
          const draft = this.createDraft(interaction, state, maps);
          const message = await discordService.updateDeferredReply(
            interaction.token,
            this.createMapsResponse(draft, availableModes),
          );
          await this.saveDraft(message.id, draft);
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
      const draft = this.createDraft(interaction, state, maps);
      const message = await this.services.discordService.createMessage(
        interaction.channel.id,
        this.createMapsResponse(draft, availableModes),
      );
      await this.saveDraft(message.id, draft);
    } catch (error) {
      this.services.logService.error(error);
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleRegenerate(interaction: APIMessageComponentButtonInteraction): Promise<void> {
    try {
      const previousDraft = await this.getDraft(interaction);
      const draft = { ...previousDraft, ...(await this.generateMapValues(previousDraft)) };
      await this.updateDraftMessage(interaction, draft);
    } catch (error) {
      this.services.logService.error(error);
      await this.services.discordService.updateDeferredReplyWithError(interaction.token, error);
    }
  }

  private async handleCountSelect(interaction: APIMessageComponentSelectMenuInteraction): Promise<void> {
    try {
      const previousDraft = await this.getDraft(interaction);
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
      const previousDraft = await this.getDraft(interaction);
      const selectedPlaylist = Preconditions.checkExists(interaction.data.values[0], "expected map playlist");
      const playlist = mapsPlaylistSchema.parse(selectedPlaylist);
      const availableModes = await this.services.haloService.getMapModesForPlaylist(playlist);
      const format = availableModes.length > 1 ? previousDraft.format : MapsFormatType.SLAYER;
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
      const previousDraft = await this.getDraft(interaction);
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
      const draft = await this.getDraft(interaction);
      const message = await this.services.discordService.createMessage(interaction.channel.id, {
        embeds: interaction.message.embeds,
        components: interaction.message.components,
        content: interaction.message.content,
      });
      await this.saveDraft(message.id, draft);

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

  private createDraft(
    interaction: APIApplicationCommandInteraction | APIMessageComponentButtonInteraction,
    state: { count: number; playlist: MapsPlaylistType; format: MapsFormatType },
    maps: { mode: MapMode; map: string }[],
  ): MapsDraft {
    return {
      userId: this.getInteractionUserId(interaction),
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

  private getDraftKey(messageId: string): string {
    return `maps:draft:${messageId}`;
  }

  private async getDraft(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
  ): Promise<MapsDraft> {
    const draft = await this.env.APP_DATA.get<MapsDraft>(this.getDraftKey(interaction.message.id), { type: "json" });
    if (draft == null) {
      throw new EndUserError("Map draft expired; run `/maps` to generate a new one.", {
        errorType: EndUserErrorType.WARNING,
        handled: true,
      });
    }
    return { ...draft, userId: this.getInteractionUserId(interaction) };
  }

  private async saveDraft(messageId: string, draft: MapsDraft): Promise<void> {
    await this.env.APP_DATA.put(this.getDraftKey(messageId), JSON.stringify(draft), {
      expirationTtl: MAP_DRAFT_TTL_SECONDS,
    });
  }

  private async updateDraftMessage(
    interaction: APIMessageComponentButtonInteraction | APIMessageComponentSelectMenuInteraction,
    draft: MapsDraft,
    availableModes?: MapMode[]  ,
  ): Promise<void> {
    const modes = availableModes ?? (await this.services.haloService.getMapModesForPlaylist(draft.playlist));
    await this.services.discordService.updateDeferredReply(interaction.token, this.createMapsResponse(draft, modes));
    await this.saveDraft(interaction.message.id, draft);
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

  private createMapsResponse(draft: MapsDraft, availableModes: MapMode[]): APIInteractionResponseCallbackData {
    const mapsEmbed = new MapsEmbed({ discordService: this.services.discordService }, { ...draft, availableModes });

    return mapsEmbed.toMessageData();
  }
}
