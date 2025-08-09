import type {
  APIApplicationCommandInteraction,
  APIEmbed,
  APIInteractionResponseCallbackData,
  APIMessageComponentButtonInteraction,
} from "discord-api-types/v10";
import {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  InteractionContextType,
  InteractionResponseType,
  MessageFlags,
  InteractionType,
  ComponentType,
  ButtonStyle,
} from "discord-api-types/v10";
import { type CommandData, type ExecuteResponse, type BaseInteraction, BaseCommand } from "../base/base.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { GAMECOACH_GG_URLS } from "./gamecoachgg.mjs";
import type { MapMode } from "./hcs.mjs";
import { CURRENT_HCS_MAPS, HISTORICAL_HCS_MAPS, HCS_SET_FORMAT, OBJECTIVE_MODES } from "./hcs.mjs";

export enum PlaylistType {
  HcsCurrent = "HCS - current",
  HcsHistorical = "HCS - historical",
}

export enum InteractionButton {
  Roll1 = "btn_maps_roll_1",
  Roll3 = "btn_maps_roll_3",
  Roll5 = "btn_maps_roll_5",
  Roll7 = "btn_maps_roll_7",
}

export class MapsCommand extends BaseCommand {
  readonly data: CommandData[] = [
    {
      type: ApplicationCommandType.ChatInput,
      name: "maps",
      description: "Generate a random set of Halo maps (default: HCS)",
      contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
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
            { name: "HCS - Current", value: PlaylistType.HcsCurrent },
            { name: "HCS - Historical (all maps + modes played in any HCS major)", value: PlaylistType.HcsHistorical },
          ],
        },
      ],
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionButton.Roll1,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionButton.Roll3,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionButton.Roll5,
      },
    },
    {
      type: InteractionType.MessageComponent,
      data: {
        component_type: ComponentType.Button,
        custom_id: InteractionButton.Roll7,
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
    const playlistOption = options?.find((opt) => opt.name === "playlist");
    const count = countOption?.type === ApplicationCommandOptionType.Integer ? (countOption.value as 1 | 3 | 5 | 7) : 5;
    const playlist: PlaylistType =
      playlistOption?.type === ApplicationCommandOptionType.String &&
      (playlistOption.value === PlaylistType.HcsCurrent.toString() ||
        playlistOption.value === PlaylistType.HcsHistorical.toString())
        ? (playlistOption.value as PlaylistType)
        : PlaylistType.HcsCurrent;

    const maps = this.generateHcsSet(count, playlist);

    return {
      response: {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: this.createMapsResponse(interaction, count, playlist, maps),
      },
    };
  }

  private messageComponentResponse(interaction: APIMessageComponentButtonInteraction): ExecuteResponse {
    const customId = interaction.data.custom_id;
    const count = this.getCountFromInteractionButton(customId);
    const playlist = this.getPlaylistTypeFromEmbed(
      Preconditions.checkExists(interaction.message.embeds[0], "Embed not found"),
    );
    const maps = this.generateHcsSet(count, playlist);

    return {
      response: {
        type: InteractionResponseType.UpdateMessage,
        data: this.createMapsResponse(interaction, count, playlist, maps),
      },
    };
  }

  private getCountFromInteractionButton(customId: string): 1 | 3 | 5 | 7 {
    switch (customId as InteractionButton) {
      case InteractionButton.Roll1: {
        return 1;
      }
      case InteractionButton.Roll3: {
        return 3;
      }
      case InteractionButton.Roll5: {
        return 5;
      }
      case InteractionButton.Roll7: {
        return 7;
      }
      default: {
        throw new Error(`Unknown button interaction: ${customId}`);
      }
    }
  }

  private getPlaylistTypeFromEmbed(embed: APIEmbed): PlaylistType {
    const title = embed.title?.split(": ")[1];
    if (title === PlaylistType.HcsCurrent) {
      return PlaylistType.HcsCurrent;
    }
    if (title === PlaylistType.HcsHistorical) {
      return PlaylistType.HcsHistorical;
    }
    throw new Error(`Unknown playlist type in embed: ${title?.toString() ?? "undefined"}`);
  }

  private createMapsResponse(
    interaction: APIApplicationCommandInteraction | APIMessageComponentButtonInteraction,
    count: 1 | 3 | 5 | 7,
    playlist: PlaylistType,
    maps: {
      mode: MapMode;
      map: string;
    }[],
  ): APIInteractionResponseCallbackData {
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
              custom_id: InteractionButton.Roll1,
              label: "Regen maps (count: 1)",
              style: count === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary,
            },
            {
              type: ComponentType.Button,
              custom_id: InteractionButton.Roll3,
              label: "Regen maps (count: 3)",
              style: count === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary,
            },
            {
              type: ComponentType.Button,
              custom_id: InteractionButton.Roll5,
              label: "Regen maps (count: 5)",
              style: count === 5 ? ButtonStyle.Primary : ButtonStyle.Secondary,
            },
            {
              type: ComponentType.Button,
              custom_id: InteractionButton.Roll7,
              label: "Regen maps (count: 7)",
              style: count === 7 ? ButtonStyle.Primary : ButtonStyle.Secondary,
            },
          ],
        },
      ],
    };
  }

  private getRandomElement<T>(arr: T[]): T {
    if (arr.length === 0) {
      throw new Error("Array is empty");
    }

    const idx = Math.floor(Math.random() * arr.length);
    const el = arr[idx];
    if (el === undefined) {
      throw new Error("Random element is undefined");
    }

    return el;
  }

  private getAllHcsModeMapPairs(playlist: PlaylistType = PlaylistType.HcsCurrent): { mode: MapMode; map: string }[] {
    const pairs: { mode: MapMode; map: string }[] = [];
    const mapSet: Record<MapMode, string[]> =
      playlist === PlaylistType.HcsHistorical ? HISTORICAL_HCS_MAPS : CURRENT_HCS_MAPS;
    const modes = Object.keys(mapSet) as MapMode[];
    for (const mode of modes) {
      for (const map of mapSet[mode]) {
        pairs.push({ mode, map });
      }
    }
    return pairs;
  }

  private pickWithPreference<T>(
    all: T[],
    usedSet: Set<string>,
    history: string[],
    getKey: (item: T) => string,
    recentWindow: number,
  ): T {
    const available = all.filter((item) => !usedSet.has(getKey(item)));
    let picked: T;

    if (available.length > 0) {
      picked = this.getRandomElement(available);
    } else {
      const recent = new Set(history.slice(0, recentWindow));
      const candidates = all.filter((item) => !recent.has(getKey(item)));
      picked = this.getRandomElement(candidates.length > 0 ? candidates : all);
    }

    usedSet.add(getKey(picked));
    history.unshift(getKey(picked));
    if (history.length > all.length) {
      history.length = all.length;
    }

    return picked;
  }

  private generateHcsSet(
    count: 1 | 3 | 5 | 7,
    playlist: PlaylistType = PlaylistType.HcsCurrent,
  ): { mode: MapMode; map: string }[] {
    const format = Preconditions.checkExists(HCS_SET_FORMAT[count]);
    const result: { mode: MapMode; map: string }[] = [];
    const usedMaps = new Set<string>();
    const usedObjectiveModes = new Set<MapMode>();
    const mapHistory: string[] = [];
    const objectiveHistory: { mode: MapMode; map: string }[] = [];
    const mapSet: Record<MapMode, string[]> =
      playlist === PlaylistType.HcsHistorical ? HISTORICAL_HCS_MAPS : CURRENT_HCS_MAPS;
    for (const type of format) {
      if (type === "slayer") {
        const allSlayerMaps: string[] = mapSet.Slayer;
        const map: string = this.pickWithPreference(
          allSlayerMaps,
          usedMaps,
          mapHistory,
          (m) => m,
          allSlayerMaps.length,
        );
        result.push({ mode: "Slayer", map });
      } else if (type === "objective") {
        const allPairs: { mode: MapMode; map: string }[] = [];
        for (const mode of OBJECTIVE_MODES as MapMode[]) {
          if (!usedObjectiveModes.has(mode)) {
            for (const map of mapSet[mode]) {
              allPairs.push({ mode, map });
            }
          }
        }
        if (allPairs.length === 0) {
          for (const mode of OBJECTIVE_MODES as MapMode[]) {
            for (const map of mapSet[mode]) {
              allPairs.push({ mode, map });
            }
          }
        }
        const pair = this.pickWithPreference(allPairs, usedMaps, mapHistory, (p) => p.map, allPairs.length);
        usedObjectiveModes.add(pair.mode);
        objectiveHistory.unshift(pair);
        if (objectiveHistory.length > OBJECTIVE_MODES.length * 2) {
          objectiveHistory.length = OBJECTIVE_MODES.length * 2;
        }
        result.push(pair);
      } else {
        const allPairs = this.getAllHcsModeMapPairs(playlist);
        const pair = this.pickWithPreference(allPairs, usedMaps, mapHistory, (p) => p.map, allPairs.length);
        result.push(pair);
      }
    }
    return result;
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
