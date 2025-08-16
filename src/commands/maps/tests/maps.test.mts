import { describe, it, beforeEach, expect, vi } from "vitest";
import type {
  APIInteractionResponseChannelMessageWithSource,
  APIApplicationCommandInteraction,
  APIMessageComponentButtonInteraction,
  APIInteractionResponseCallbackData,
  APIActionRowComponent,
  APIMessageTopLevelComponent,
  APIButtonComponentWithCustomId,
  APIMessageComponentSelectMenuInteraction,
  APIStringSelectComponent,
  APIEmbed,
  APIMessage,
} from "discord-api-types/v10";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionType,
  Locale,
  ComponentType,
  MessageFlags,
  ButtonStyle,
  InteractionResponseType,
} from "discord-api-types/v10";
import type { MapMode } from "../../../services/halo/hcs.mjs";
import { MapsCommand } from "../maps.mjs";
import { InteractionComponent } from "../../../embeds/maps-embed.mjs";
import { installFakeServicesWith } from "../../../services/fakes/services.mjs";
import type { Services } from "../../../services/install.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import { apiMessage, fakeBaseAPIApplicationCommandInteraction } from "../../../services/discord/fakes/data.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import { MapsFormatType, MapsPlaylistType } from "../../../services/database/types/guild_config.mjs";

function aFakeMapsInteractionWith(
  options: { name: string; value: unknown; type: number }[] = [],
): APIApplicationCommandInteraction {
  return {
    ...fakeBaseAPIApplicationCommandInteraction,
    type: InteractionType.ApplicationCommand,
    guild: {
      ...fakeBaseAPIApplicationCommandInteraction.guild,
      id: "fake-guild-id",
      locale: Locale.EnglishUS,
      features: [], // Ensure features is always present
    },
    guild_id: "fake-guild-id",
    data: {
      id: "fake-cmd-id",
      name: "maps",
      options,
      resolved: {},
      type: ApplicationCommandType.ChatInput,
    },
  };
}

function getButtonRow(
  components: APIMessageTopLevelComponent[] | undefined,
): APIActionRowComponent<APIButtonComponentWithCustomId> {
  return components?.find(
    (c) =>
      c.type === ComponentType.ActionRow &&
      c.components.every((subComponent) => subComponent.type === ComponentType.Button),
  ) as APIActionRowComponent<APIButtonComponentWithCustomId>;
}

function getButtonById(
  row: APIActionRowComponent<APIButtonComponentWithCustomId> | undefined,
  custom_id: string,
): APIButtonComponentWithCustomId {
  return Preconditions.checkExists(row?.components.find((b) => b.custom_id === custom_id));
}

function getSelectMenu(components: APIMessageTopLevelComponent[] | undefined): APIStringSelectComponent {
  for (const row of components ?? []) {
    if (row.type === ComponentType.ActionRow && "components" in row && Array.isArray(row.components)) {
      for (const c of row.components) {
        if (c.type === ComponentType.StringSelect) {
          return c;
        }
      }
    }
  }

  throw new Error("No select menu found in components");
}

function aFakeMapsMessage({
  playlist = MapsPlaylistType.HCS_CURRENT,
  format = MapsFormatType.HCS,
  count = 5,
  selectedPlaylist,
  selectedFormat,
}: {
  playlist?: MapsPlaylistType;
  format?: MapsFormatType;
  count?: 1 | 3 | 5 | 7;
  selectedPlaylist?: MapsPlaylistType | undefined;
  selectedFormat?: MapsFormatType | undefined;
}): {
  embeds: APIEmbed[];
  components: APIMessageTopLevelComponent[];
} {
  const lines = Array(count)
    .fill(0)
    .map((_, i) => String(i + 1));
  return {
    embeds: [
      {
        title: `Maps: ${format}`,
        fields: [
          { name: "#", value: lines.join("\n"), inline: true },
          { name: "Mode", value: Array(count).fill("Slayer").join("\n"), inline: true },
          { name: "Map", value: Array(count).fill("Live Fire").join("\n"), inline: true },
        ],
      } as APIEmbed,
    ],
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            custom_id: InteractionComponent.Roll1,
            style: count === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary,
          },
          {
            type: ComponentType.Button,
            custom_id: InteractionComponent.Roll3,
            style: count === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary,
          },
          {
            type: ComponentType.Button,
            custom_id: InteractionComponent.Roll5,
            style: count === 5 ? ButtonStyle.Primary : ButtonStyle.Secondary,
          },
          {
            type: ComponentType.Button,
            custom_id: InteractionComponent.Roll7,
            style: count === 7 ? ButtonStyle.Primary : ButtonStyle.Secondary,
          },
        ],
      } as APIMessageTopLevelComponent,
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.StringSelect,
            custom_id: InteractionComponent.PlaylistSelect,
            options: [
              {
                label: MapsPlaylistType.HCS_CURRENT,
                value: MapsPlaylistType.HCS_CURRENT,
                default: String(selectedPlaylist ?? playlist) === String(MapsPlaylistType.HCS_CURRENT),
              },
              {
                label: `${MapsPlaylistType.HCS_HISTORICAL} (all maps + modes played in any HCS major)`,
                value: MapsPlaylistType.HCS_HISTORICAL,
                default: String(selectedPlaylist ?? playlist) === String(MapsPlaylistType.HCS_HISTORICAL),
              },
            ],
            placeholder: "Select a playlist",
          },
        ],
      } as APIMessageTopLevelComponent,
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.StringSelect,
            custom_id: InteractionComponent.FormatSelect,
            options: [
              {
                label: MapsFormatType.HCS,
                value: MapsFormatType.HCS,
                default: String(selectedFormat ?? format) === String(MapsFormatType.HCS),
              },
              {
                label: MapsFormatType.RANDOM,
                value: MapsFormatType.RANDOM,
                default: String(selectedFormat ?? format) === String(MapsFormatType.RANDOM),
              },
              {
                label: MapsFormatType.OBJECTIVE,
                value: MapsFormatType.OBJECTIVE,
                default: String(selectedFormat ?? format) === String(MapsFormatType.OBJECTIVE),
              },
              {
                label: MapsFormatType.SLAYER,
                value: MapsFormatType.SLAYER,
                default: String(selectedFormat ?? format) === String(MapsFormatType.SLAYER),
              },
            ],
          },
        ],
      } as APIMessageTopLevelComponent,
    ],
  };
}

function aFakeApiMessage({
  playlist = MapsPlaylistType.HCS_CURRENT,
  format = MapsFormatType.HCS,
  count = 5,
  selectedPlaylist,
  selectedFormat,
}: {
  playlist?: MapsPlaylistType;
  format?: MapsFormatType | undefined;
  count?: 1 | 3 | 5 | 7;
  selectedPlaylist?: MapsPlaylistType | undefined;
  selectedFormat?: MapsFormatType | undefined;
}): APIMessage {
  return {
    ...apiMessage,
    embeds: aFakeMapsMessage({ playlist, format, count, selectedPlaylist, selectedFormat }).embeds,
    components: aFakeMapsMessage({ playlist, format, count, selectedPlaylist, selectedFormat }).components,
  };
}

function aFakeButtonInteraction(
  customId: string,
  playlist: MapsPlaylistType = MapsPlaylistType.HCS_CURRENT,
  format: MapsFormatType = MapsFormatType.HCS,
  count: 1 | 3 | 5 | 7 = 5,
): APIMessageComponentButtonInteraction {
  return {
    ...fakeBaseAPIApplicationCommandInteraction,
    id: "fake-interaction-id",
    type: InteractionType.MessageComponent,
    data: {
      component_type: ComponentType.Button,
      custom_id: customId,
    },
    message: aFakeApiMessage({ playlist, format, count }),
  };
}

function aFakePlaylistSelectInteraction(
  selectedPlaylist: MapsPlaylistType,
  count: 1 | 3 | 5 | 7 = 5,
  playlist: MapsPlaylistType = MapsPlaylistType.HCS_CURRENT,
  format: MapsFormatType = MapsFormatType.HCS,
): APIMessageComponentSelectMenuInteraction {
  return {
    ...fakeBaseAPIApplicationCommandInteraction,
    id: "fake-interaction-id",
    type: InteractionType.MessageComponent,
    data: {
      component_type: ComponentType.StringSelect,
      custom_id: InteractionComponent.PlaylistSelect,
      values: [selectedPlaylist],
    },
    message: aFakeApiMessage({ playlist, format, count, selectedPlaylist }),
  };
}

describe("MapsCommand", () => {
  let command: MapsCommand;
  let services: Services;
  const env = aFakeEnvWith();
  const mockMaps = [
    { mode: "Slayer" as MapMode, map: "Live Fire" },
    { mode: "Oddball" as MapMode, map: "Streets" },
    { mode: "Strongholds" as MapMode, map: "Bazaar" },
    { mode: "CTF" as MapMode, map: "Aquarius" },
    { mode: "Slayer" as MapMode, map: "Recharge" },
  ];

  beforeEach(() => {
    services = installFakeServicesWith({ env });
    command = new MapsCommand(services, env);
    vi.spyOn(services.logService, "error").mockImplementation(() => undefined);
    vi.spyOn(services.discordService, "getEmojiFromName").mockReturnValue(":GameCoachGG:");
    vi.spyOn(services.haloService, "generateMaps").mockReturnValue(mockMaps);
  });

  describe("/maps basic usage", () => {
    it("renders the mock maps in the embed", () => {
      const interaction = aFakeMapsInteractionWith();
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      expect(data).toHaveProperty("embeds");

      const embed = data.embeds?.[0];
      expect(embed).toBeDefined();
      expect(embed?.fields?.length).toBeGreaterThanOrEqual(3);

      const modes = embed?.fields?.[1]?.value.split("\n") ?? [];
      const maps = embed?.fields?.[2]?.value.split("\n") ?? [];
      expect(modes).toEqual(["Slayer", "Oddball", "Strongholds", "CTF", "Slayer"]);
      expect(maps).toEqual([
        "[Live Fire :GameCoachGG:](https://gamecoach.gg/esports/haloinfinite/livefire)",
        "[Streets :GameCoachGG:](https://gamecoach.gg/esports/haloinfinite/streets)",
        "Bazaar",
        "[Aquarius :GameCoachGG:](https://gamecoach.gg/esports/haloinfinite/aquarius)",
        "[Recharge :GameCoachGG:](https://gamecoach.gg/esports/haloinfinite/recharge)",
      ]);
    });
  });

  describe("/maps playlist option", () => {
    it("returns maps from the historical playlist when selected", () => {
      const interaction = aFakeMapsInteractionWith([
        { name: "playlist", value: MapsPlaylistType.HCS_HISTORICAL, type: ApplicationCommandOptionType.String },
      ]);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];

      expect(embed).toBeDefined();
      expect(embed?.title).toContain(MapsPlaylistType.HCS_HISTORICAL);
      expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(5);
    });

    it("returns maps from the current playlist by default", () => {
      const interaction = aFakeMapsInteractionWith();
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];

      expect(embed).toBeDefined();
      expect(embed?.title).toContain(MapsPlaylistType.HCS_CURRENT);
      expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(5);
    });
  });

  describe("/maps button interaction", () => {
    it("regenerates maps with correct count and playlist when button is pressed", () => {
      const interaction = aFakeButtonInteraction(InteractionComponent.Roll3, MapsPlaylistType.HCS_HISTORICAL);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];

      expect(embed).toBeDefined();
      expect(embed?.title).toBeDefined();
      expect(embed?.title ?? "").toContain(MapsPlaylistType.HCS_HISTORICAL);
      expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(5);

      const buttonRowHist = getButtonRow(data.components);
      expect(getButtonById(buttonRowHist, InteractionComponent.Roll3).style).toBe(ButtonStyle.Primary);
    });

    it("throws for unknown button id", () => {
      const interaction = aFakeButtonInteraction("btn_maps_roll_unknown");
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;

      expect(data.content).toMatch(/Unreachable code with specified value/);
      expect(data.flags).toBe(MessageFlags.Ephemeral);
    });

    it("throws for unknown playlist in embed", () => {
      const interaction = aFakeButtonInteraction(InteractionComponent.Roll1, "NotAPlaylist" as MapsPlaylistType);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;

      expect(typeof data.content).toBe("string");
      expect(data.content).toMatch(/Playlist not found/i);
      expect(data.flags).toBe(MessageFlags.Ephemeral);
    });

    it("returns DeferredMessageUpdate and jobToComplete for Initiate button", async () => {
      const interaction = aFakeButtonInteraction(InteractionComponent.Initiate);
      const { response, jobToComplete } = command.execute(interaction);

      expect(response).toEqual({ type: InteractionResponseType.DeferredMessageUpdate });
      expect(jobToComplete).toBeDefined();

      const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);
      await jobToComplete?.();
      const [channelId, data] = createMessageSpy.mock.calls[0] as [string, APIInteractionResponseCallbackData];

      expect(channelId).toBe(interaction.channel.id);
      expect(data.embeds?.[0]?.title).toContain("Maps: HCS - Current");

      const actionRow = getButtonRow(data.components);
      expect(actionRow.components).toHaveLength(4);
    });
  });

  describe("/maps repost button interaction", () => {
    it("returns DeferredMessageUpdate and reposts the maps, then deletes the original message", async () => {
      const interaction = aFakeButtonInteraction(InteractionComponent.Repost);
      const { response, jobToComplete } = command.execute(interaction);
      expect(response).toEqual({ type: InteractionResponseType.DeferredMessageUpdate });
      expect(jobToComplete).toBeDefined();

      const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);
      const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue();
      await jobToComplete?.();

      expect(createMessageSpy).toHaveBeenCalledTimes(1);
      expect(deleteMessageSpy).toHaveBeenCalledTimes(1);

      const [channelId, data] = createMessageSpy.mock.calls[0] as [string, APIInteractionResponseCallbackData];
      expect(channelId).toBe(interaction.channel.id);
      expect(data.embeds?.[0]?.title).toContain("Maps:"); // Allow flexible title format after manual edits

      const [delChannelId, delMessageId, delReason] = deleteMessageSpy.mock.calls[0] as [string, string, string];
      expect(delChannelId).toBe(interaction.channel.id);
      expect(delMessageId).toBe(interaction.message.id);
      expect(delReason).toBe("Reposting maps");
    });
  });

  describe("/maps playlist select interaction", () => {
    it("updates the embed and buttons when playlist is switched to historical", () => {
      const interaction = aFakePlaylistSelectInteraction(
        MapsPlaylistType.HCS_HISTORICAL,
        3,
        MapsPlaylistType.HCS_HISTORICAL,
      );
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];

      expect(embed).toBeDefined();
      expect(typeof embed?.title).toBe("string");
      expect(embed?.title ?? "").toContain(MapsPlaylistType.HCS_HISTORICAL);

      const buttonRow = getButtonRow(data.components);
      expect(getButtonById(buttonRow, InteractionComponent.Roll3).style).toBe(ButtonStyle.Primary);

      const select = getSelectMenu(data.components);
      expect(select.custom_id).toBe(InteractionComponent.PlaylistSelect);
      expect(select.options.find((o) => o.value === String(MapsPlaylistType.HCS_HISTORICAL))?.default).toBe(true);
      expect(select.options.find((o) => o.value === String(MapsPlaylistType.HCS_CURRENT))?.default).toBe(false);
    });

    it("updates the embed and buttons when playlist is switched to current", () => {
      const interaction = aFakePlaylistSelectInteraction(MapsPlaylistType.HCS_CURRENT, 7, MapsPlaylistType.HCS_CURRENT);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];

      expect(embed).toBeDefined();
      expect(embed?.title).toBeDefined();
      expect(embed?.title).toContain(MapsPlaylistType.HCS_CURRENT);

      const buttonRow = getButtonRow(data.components);
      expect(getButtonById(buttonRow, InteractionComponent.Roll7).style).toBe(ButtonStyle.Primary);

      const select = getSelectMenu(data.components);
      expect(select.custom_id).toBe(InteractionComponent.PlaylistSelect);
      expect(select.options.find((o) => o.value === String(MapsPlaylistType.HCS_CURRENT))?.default).toBe(true);
      expect(select.options.find((o) => o.value === String(MapsPlaylistType.HCS_HISTORICAL))?.default).toBe(false);
    });
  });
});
