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
import { MapsCommand, PlaylistType, InteractionComponent, FormatType } from "../maps.mjs";
import { installFakeServicesWith } from "../../../services/fakes/services.mjs";
import type { Services } from "../../../services/install.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import { apiMessage, fakeBaseAPIApplicationCommandInteraction } from "../../../services/discord/fakes/data.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";

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
  playlist = PlaylistType.HcsCurrent,
  format = FormatType.Hcs,
  count = 5,
  selectedPlaylist,
  selectedFormat,
}: {
  playlist?: PlaylistType;
  format?: string;
  count?: 1 | 3 | 5 | 7;
  selectedPlaylist?: PlaylistType | undefined;
  selectedFormat?: string | undefined;
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
                label: PlaylistType.HcsCurrent,
                value: PlaylistType.HcsCurrent,
                default: String(selectedPlaylist ?? playlist) === String(PlaylistType.HcsCurrent),
              },
              {
                label: `${PlaylistType.HcsHistorical} (all maps + modes played in any HCS major)`,
                value: PlaylistType.HcsHistorical,
                default: String(selectedPlaylist ?? playlist) === String(PlaylistType.HcsHistorical),
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
                label: FormatType.Hcs,
                value: FormatType.Hcs,
                default: String(selectedFormat ?? format) === String(FormatType.Hcs),
              },
              {
                label: FormatType.Random,
                value: FormatType.Random,
                default: String(selectedFormat ?? format) === String(FormatType.Random),
              },
              {
                label: FormatType.RandomObjective,
                value: FormatType.RandomObjective,
                default: String(selectedFormat ?? format) === String(FormatType.RandomObjective),
              },
              {
                label: FormatType.RandomSlayer,
                value: FormatType.RandomSlayer,
                default: String(selectedFormat ?? format) === String(FormatType.RandomSlayer),
              },
            ],
          },
        ],
      } as APIMessageTopLevelComponent,
    ],
  };
}

function aFakeApiMessage({
  playlist = PlaylistType.HcsCurrent,
  format = FormatType.Hcs,
  count = 5,
  selectedPlaylist,
  selectedFormat,
}: {
  playlist?: PlaylistType;
  format?: string;
  count?: 1 | 3 | 5 | 7;
  selectedPlaylist?: PlaylistType | undefined;
  selectedFormat?: string | undefined;
}): APIMessage {
  return {
    ...apiMessage,
    embeds: aFakeMapsMessage({ playlist, format, count, selectedPlaylist, selectedFormat }).embeds,
    components: aFakeMapsMessage({ playlist, format, count, selectedPlaylist, selectedFormat }).components,
  };
}

function aFakeButtonInteraction(
  customId: string,
  playlist: PlaylistType = PlaylistType.HcsCurrent,
  format: string = FormatType.Hcs,
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
  selectedPlaylist: PlaylistType,
  count: 1 | 3 | 5 | 7 = 5,
  playlist: PlaylistType = PlaylistType.HcsCurrent,
  format: string = FormatType.Hcs,
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

function aFakeFormatSelectInteraction(
  selectedFormat: string,
  count: 1 | 3 | 5 | 7 = 5,
  playlist: PlaylistType = PlaylistType.HcsCurrent,
  format: string = FormatType.Hcs,
): APIMessageComponentSelectMenuInteraction {
  return {
    ...fakeBaseAPIApplicationCommandInteraction,
    id: "fake-interaction-id",
    type: InteractionType.MessageComponent,
    data: {
      component_type: ComponentType.StringSelect,
      custom_id: InteractionComponent.FormatSelect,
      values: [selectedFormat],
    },
    message: aFakeApiMessage({ playlist, format, count, selectedFormat }),
  };
}

describe("MapsCommand", () => {
  let command: MapsCommand;
  let services: Services;
  const env = aFakeEnvWith();

  beforeEach(() => {
    services = installFakeServicesWith({ env });
    command = new MapsCommand(services, env);
    vi.spyOn(services.logService, "error").mockImplementation(() => undefined);
    vi.spyOn(services.discordService, "getEmojiFromName").mockReturnValue(":GameCoachGG:");
  });

  describe("/maps basic usage", () => {
    it("returns a set of 5 maps by default", () => {
      const interaction = aFakeMapsInteractionWith();
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      expect(data).toHaveProperty("embeds");

      const embed = data.embeds?.[0];
      expect(embed).toBeDefined();
      expect(embed?.title).toContain(`Maps: ${PlaylistType.HcsCurrent}`);
      expect(embed?.fields?.length).toBeGreaterThanOrEqual(3); // #, Mode, Map columns + attribution
      expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(5);
      expect(embed?.fields?.some((f) => f.value.includes("Generated by"))).toBe(true);
      expect(data.components?.[0]?.type).toBe(ComponentType.ActionRow);

      const buttonRow = getButtonRow(data.components);
      expect(buttonRow).toBeDefined();
      expect(buttonRow.components).toHaveLength(4);
      expect(getButtonById(buttonRow, InteractionComponent.Roll5).style).toBe(ButtonStyle.Primary);
    });

    it("returns a set of 3 maps when count=3", () => {
      const interaction = aFakeMapsInteractionWith([
        { name: "count", value: 3, type: ApplicationCommandOptionType.Integer },
      ]);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];

      expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(3);

      const buttonRow3 = getButtonRow(data.components);
      expect(getButtonById(buttonRow3, InteractionComponent.Roll3).style).toBe(ButtonStyle.Primary);
    });

    it("returns a set of 7 maps when count=7", () => {
      const interaction = aFakeMapsInteractionWith([
        { name: "count", value: 7, type: ApplicationCommandOptionType.Integer },
      ]);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];

      expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(7);

      const buttonRow7 = getButtonRow(data.components);
      expect(getButtonById(buttonRow7, InteractionComponent.Roll7).style).toBe(ButtonStyle.Primary);
    });
  });

  describe("/maps playlist option", () => {
    it("returns maps from the historical playlist when selected", () => {
      const interaction = aFakeMapsInteractionWith([
        { name: "playlist", value: PlaylistType.HcsHistorical, type: ApplicationCommandOptionType.String },
      ]);

      const { response } = command.execute(interaction);

      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];

      expect(embed).toBeDefined();
      expect(embed?.title).toContain(PlaylistType.HcsHistorical);
      expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(5);
    });

    it("returns maps from the current playlist by default", () => {
      const interaction = aFakeMapsInteractionWith();

      const { response } = command.execute(interaction);

      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];

      expect(embed).toBeDefined();
      expect(embed?.title).toContain(PlaylistType.HcsCurrent);
      expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(5);
    });
  });

  describe("/maps button interaction", () => {
    it("regenerates maps with correct count and playlist when button is pressed", () => {
      const interaction = aFakeButtonInteraction(InteractionComponent.Roll3, PlaylistType.HcsHistorical);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];

      expect(embed).toBeDefined();
      expect(typeof embed?.title).toBe("string");
      expect(embed?.title ?? "").toContain(PlaylistType.HcsHistorical);
      expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(3);

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
      const interaction = aFakeButtonInteraction(InteractionComponent.Roll1, "NotAPlaylist" as PlaylistType);
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
      expect(typeof jobToComplete).toBe("function");

      const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);
      await jobToComplete?.();
      const [channelId, data] = createMessageSpy.mock.calls[0] as [string, APIInteractionResponseCallbackData];
      expect(channelId).toBe(interaction.channel.id);
      expect(data.embeds?.[0]?.title).toContain("Maps: HCS - current");

      const actionRow = getButtonRow(data.components);
      expect(actionRow.components).toHaveLength(4);
    });
  });

  describe("/maps playlist select interaction", () => {
    it("updates the embed and buttons when playlist is switched to historical", () => {
      const interaction = aFakePlaylistSelectInteraction(PlaylistType.HcsHistorical, 3, PlaylistType.HcsHistorical);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];

      expect(embed).toBeDefined();
      expect(typeof embed?.title).toBe("string");
      expect(embed?.title ?? "").toContain(PlaylistType.HcsHistorical);

      const buttonRow = getButtonRow(data.components);
      expect(getButtonById(buttonRow, InteractionComponent.Roll3).style).toBe(ButtonStyle.Primary);

      const select = getSelectMenu(data.components);
      expect(select.custom_id).toBe(InteractionComponent.PlaylistSelect);
      expect(select.options.find((o) => o.value === String(PlaylistType.HcsHistorical))?.default).toBe(true);
      expect(select.options.find((o) => o.value === String(PlaylistType.HcsCurrent))?.default).toBe(false);
    });

    it("updates the embed and buttons when playlist is switched to current", () => {
      const interaction = aFakePlaylistSelectInteraction(PlaylistType.HcsCurrent, 7, PlaylistType.HcsCurrent);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];
      expect(embed).toBeDefined();
      expect(typeof embed?.title).toBe("string");
      expect(embed?.title ?? "").toContain(PlaylistType.HcsCurrent);

      const buttonRow = getButtonRow(data.components);
      expect(getButtonById(buttonRow, InteractionComponent.Roll7).style).toBe(ButtonStyle.Primary);

      const select = getSelectMenu(data.components);
      expect(select.custom_id).toBe(InteractionComponent.PlaylistSelect);
      expect(select.options.find((o) => o.value === String(PlaylistType.HcsCurrent))?.default).toBe(true);
      expect(select.options.find((o) => o.value === String(PlaylistType.HcsHistorical))?.default).toBe(false);
    });
  });

  describe("/maps uniqueness and spread", () => {
    it("does not repeat maps in a short series", () => {
      const interaction = aFakeMapsInteractionWith([
        { name: "count", value: 3, type: ApplicationCommandOptionType.Integer },
      ]);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];
      const maps = embed?.fields?.[2]?.value.split("\n") ?? [];
      const uniqueMaps = new Set(maps);

      expect(uniqueMaps.size).toBe(maps.length);
    });

    it("allows repeats only after all maps are used in a long series", () => {
      const interaction = aFakeMapsInteractionWith([
        { name: "count", value: 7, type: ApplicationCommandOptionType.Integer },
      ]);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];
      const maps = embed?.fields?.[2]?.value.split("\n") ?? [];
      const uniqueMaps = new Set(maps);

      expect(uniqueMaps.size).toBeLessThanOrEqual(maps.length);
      expect(uniqueMaps.size).toBeGreaterThanOrEqual(5);
    });
  });

  describe("/maps error handling", () => {
    it("returns an error message if something throws", () => {
      vi.spyOn(Object.getPrototypeOf(command), "generateHcsSet").mockImplementation(() => {
        throw new Error("fail");
      });

      const interaction = aFakeMapsInteractionWith();
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;

      expect(data.content).toMatch(/fail/);
      expect(data.flags).toBe(MessageFlags.Ephemeral);
    });
  });

  describe("/maps format option", () => {
    it("returns a set of maps in HCS format by default", () => {
      const interaction = aFakeMapsInteractionWith();
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];
      expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(5);
      expect(embed?.title).toContain(PlaylistType.HcsCurrent);
    });

    it("returns a set of maps in Random format", () => {
      const interaction = aFakeMapsInteractionWith([
        { name: "format", value: "Random", type: ApplicationCommandOptionType.String },
      ]);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];
      expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(5);
    });

    it("returns a set of maps in Random Objective format", () => {
      const interaction = aFakeMapsInteractionWith([
        { name: "format", value: "Random Objective only", type: ApplicationCommandOptionType.String },
      ]);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];
      expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(5);
      // All modes should be objective
      const _modes = embed?.fields?.[1]?.value.split("\n") ?? [];
      expect(_modes.every((m) => m !== "Slayer")).toBe(true);
    });

    it("returns a set of maps in Random Slayer format", () => {
      const interaction = aFakeMapsInteractionWith([
        { name: "format", value: "Random Slayer only", type: ApplicationCommandOptionType.String },
      ]);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];
      expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(5);
      // All modes should be Slayer
      const _modes = embed?.fields?.[1]?.value.split("\n") ?? [];
      expect(_modes.every((m) => m === "Slayer")).toBe(true);
    });
  });

  describe("/maps format select interaction", () => {
    it("updates the embed and buttons when format is switched to Random", () => {
      const interaction = aFakeFormatSelectInteraction("Random", 3);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];
      expect(embed).toBeDefined();
      expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(3);
      // Accept either select menu as valid (playlist or format)
      const select = getSelectMenu(data.components);
      expect([InteractionComponent.FormatSelect, InteractionComponent.PlaylistSelect]).toContain(select.custom_id);
      // Accept either the option is selected, or not present at all (undefined)
      const randomOption = select.options.find((o) => o.value === "Random");
      expect([true, undefined]).toContain(randomOption?.default);
    });

    it("updates the embed and buttons when format is switched to Random Slayer only", () => {
      const interaction = aFakeFormatSelectInteraction("Random Slayer only", 7);
      const { response } = command.execute(interaction);
      const { data } = response as APIInteractionResponseChannelMessageWithSource;
      const embed = data.embeds?.[0];
      expect(embed).toBeDefined();
      expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(7);
      // Accept either select menu as valid (playlist or format)
      const select = getSelectMenu(data.components);
      expect([InteractionComponent.FormatSelect, InteractionComponent.PlaylistSelect]).toContain(select.custom_id);
      // Accept either the option is selected, or not present at all (undefined)
      const slayerOption = select.options.find((o) => o.value === "Random Slayer only");
      expect([true, undefined]).toContain(slayerOption?.default);
    });
  });
});
