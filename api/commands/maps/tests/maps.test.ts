import type { Mock, MockInstance } from "vitest";
import { describe, it, beforeEach, expect, vi } from "vitest";
import type {
  APIInteractionResponse,
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
  InteractionResponseType,
} from "discord-api-types/v10";
import type { MapMode } from "../../../services/halo/hcs";
import { MapsCommand } from "../maps";
import { InteractionComponent } from "../../../embeds/maps-embed";
import { MAP_COUNTS } from "../../../services/halo/hcs";
import { installFakeServicesWith } from "../../../services/fakes/services";
import type { Services } from "../../../services/install";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { apiMessage, fakeBaseAPIApplicationCommandInteraction } from "../../../services/discord/fakes/data";
import { MapsFormatType, MapsPlaylistType } from "../../../services/database/types/guild_config";
import type { EndUserError} from "../../../base/end-user-error";
import { EndUserErrorType } from "../../../base/end-user-error";

interface FakeMapsDraft {
  userId: string;
  count: number;
  playlist: MapsPlaylistType;
  format: MapsFormatType;
  maps: { mode: MapMode; map: string }[];
}

const fakeMapsDrafts = new Map<string, FakeMapsDraft>();

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

function getSelectMenu(
  components: APIMessageTopLevelComponent[] | undefined,
  customId?: string,
): APIStringSelectComponent {
  for (const row of components ?? []) {
    if (row.type === ComponentType.ActionRow && "components" in row && Array.isArray(row.components)) {
      for (const c of row.components) {
        if (c.type === ComponentType.StringSelect && (customId === undefined || c.custom_id === customId)) {
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
  count?: number;
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
      },
    ],
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.StringSelect,
            custom_id: InteractionComponent.CountSelect,
            options: MAP_COUNTS.map((value) => ({
              label: value.toString(),
              value: value.toString(),
              default: value === count,
            })),
          },
        ],
      },
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
                default: (selectedPlaylist ?? playlist) === MapsPlaylistType.HCS_CURRENT,
              },
              {
                label: `${MapsPlaylistType.HCS_HISTORICAL} (all maps + modes played in any HCS major)`,
                value: MapsPlaylistType.HCS_HISTORICAL,
                default: (selectedPlaylist ?? playlist) === MapsPlaylistType.HCS_HISTORICAL,
              },
            ],
            placeholder: "Select a playlist",
          },
        ],
      },
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
                default: (selectedFormat ?? format) === MapsFormatType.HCS,
              },
              {
                label: MapsFormatType.RANDOM,
                value: MapsFormatType.RANDOM,
                default: (selectedFormat ?? format) === MapsFormatType.RANDOM,
              },
              {
                label: MapsFormatType.OBJECTIVE,
                value: MapsFormatType.OBJECTIVE,
                default: (selectedFormat ?? format) === MapsFormatType.OBJECTIVE,
              },
              {
                label: MapsFormatType.SLAYER,
                value: MapsFormatType.SLAYER,
                default: (selectedFormat ?? format) === MapsFormatType.SLAYER,
              },
            ],
          },
        ],
      },
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            custom_id: InteractionComponent.Regenerate,
            style: 1,
          },
          {
            type: ComponentType.Button,
            custom_id: InteractionComponent.Repost,
            style: 2,
          },
        ],
      },
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
  count?: number;
  selectedPlaylist?: MapsPlaylistType | undefined;
  selectedFormat?: MapsFormatType | undefined;
}): APIMessage {
  const message = {
    ...apiMessage,
    embeds: aFakeMapsMessage({ playlist, format, count, selectedPlaylist, selectedFormat }).embeds,
    components: aFakeMapsMessage({ playlist, format, count, selectedPlaylist, selectedFormat }).components,
  };
  fakeMapsDrafts.set(`maps:draft:${message.id}`, {
    userId: "user123",
    count,
    playlist,
    format,
    maps: [],
  });
  return message;
}

function aFakeButtonInteraction(
  customId: string,
  playlist: MapsPlaylistType = MapsPlaylistType.HCS_CURRENT,
  format: MapsFormatType = MapsFormatType.HCS,
  count = 5,
): APIMessageComponentButtonInteraction {
  return {
    ...fakeBaseAPIApplicationCommandInteraction,
    id: "fake-interaction-id",
    guild_id: "fake-guild-id",
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
  count = 5,
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

function aFakeCountSelectInteraction(selectedCount: number): APIMessageComponentSelectMenuInteraction {
  return {
    ...fakeBaseAPIApplicationCommandInteraction,
    id: "fake-interaction-id",
    type: InteractionType.MessageComponent,
    data: {
      component_type: ComponentType.StringSelect,
      custom_id: InteractionComponent.CountSelect,
      values: [selectedCount.toString()],
    },
    message: aFakeApiMessage({}),
  };
}

function aFakeFormatSelectInteraction(
  selectedFormat: MapsFormatType,
  count = 5,
  playlist: MapsPlaylistType = MapsPlaylistType.HCS_CURRENT,
  format: MapsFormatType = MapsFormatType.HCS,
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
  let env: Env;
  let updateDeferredReplySpy: MockInstance;
  let appDataPutSpy: Mock<(key: string, value: string, options: { expirationTtl?: number }) => Promise<void>>;
  const mockMaps = [
    { mode: "Slayer" as MapMode, map: "Live Fire" },
    { mode: "Oddball" as MapMode, map: "Streets" },
    { mode: "Strongholds" as MapMode, map: "Bazaar" },
    { mode: "CTF" as MapMode, map: "Aquarius" },
    { mode: "Slayer" as MapMode, map: "Recharge" },
  ];

  beforeEach(() => {
    services = installFakeServicesWith();
    fakeMapsDrafts.clear();
    const appDataGetSpy = vi.fn<(key: string) => Promise<FakeMapsDraft | null>>();
    appDataGetSpy.mockImplementation(async (key) => Promise.resolve(fakeMapsDrafts.get(key) ?? null));
    appDataPutSpy = vi.fn<(key: string, value: string, options: { expirationTtl?: number }) => Promise<void>>();
    appDataPutSpy.mockImplementation(async (key, value) => {
      fakeMapsDrafts.set(key, JSON.parse(value) as FakeMapsDraft);
      return Promise.resolve();
    });
    env = aFakeEnvWith({
      APP_DATA: { get: appDataGetSpy, put: appDataPutSpy } as unknown as KVNamespace,
    });
    command = new MapsCommand(services, env);

    updateDeferredReplySpy = vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue(apiMessage);
    vi.spyOn(services.logService, "error").mockImplementation(() => undefined);
    vi.spyOn(services.discordService, "getEmojiFromName").mockReturnValue(":GameCoachGG:");
    vi.spyOn(services.haloService, "generateMaps").mockResolvedValue(mockMaps);
    vi.spyOn(services.haloService, "getMapModesForPlaylist").mockResolvedValue([
      "Slayer",
      "Capture the Flag",
      "Strongholds",
      "Oddball",
      "King of the Hill",
    ]);
  });

  describe("execute(): application command", () => {
    it("returns response and jobToComplete", () => {
      const interaction = aFakeMapsInteractionWith();

      const { response, jobToComplete } = command.execute(interaction);

      expect(response).toEqual<APIInteractionResponse>({
        type: InteractionResponseType.DeferredChannelMessageWithSource,
      });
      expect(jobToComplete).toBeInstanceOf(Function);
    });

    describe("jobToComplete", () => {
      let jobToComplete: (() => Promise<void>) | undefined;

      beforeEach(() => {
        const interaction = aFakeMapsInteractionWith();
        const { jobToComplete: jtc } = command.execute(interaction);
        jobToComplete = jtc;
      });

      it("calls discordService.updateDeferredReply with maps embed", async () => {
        await jobToComplete?.();

        expect(updateDeferredReplySpy).toHaveBeenCalledOnce();
        expect(updateDeferredReplySpy.mock.lastCall).toMatchSnapshot();
        expect(appDataPutSpy).toHaveBeenCalledWith(`maps:draft:${apiMessage.id}`, expect.any(String), {
          expirationTtl: 60 * 60 * 6,
        });
      });

      it("renders the mock maps in the embed", async () => {
        await jobToComplete?.();

        const [, data] = updateDeferredReplySpy.mock.calls[0] as [string, APIInteractionResponseCallbackData];
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

    it("saves Slayer as the format for an initial Slayer-only draft", async () => {
      vi.spyOn(services.haloService, "getMapModesForPlaylist").mockResolvedValue(["Slayer"]);
      const interaction = aFakeMapsInteractionWith();
      const { jobToComplete } = command.execute(interaction);

      await jobToComplete?.();

      expect(fakeMapsDrafts.get(`maps:draft:${apiMessage.id}`)?.format).toBe(MapsFormatType.SLAYER);
    });
  });

  describe("execute(): application command with options", () => {
    describe("playlist option", () => {
      it("returns deferred response and jobToComplete for historical playlist", () => {
        const interaction = aFakeMapsInteractionWith([
          { name: "playlist", value: MapsPlaylistType.HCS_HISTORICAL, type: ApplicationCommandOptionType.String },
        ]);

        const { response, jobToComplete } = command.execute(interaction);

        expect(response).toEqual<APIInteractionResponse>({
          type: InteractionResponseType.DeferredChannelMessageWithSource,
        });
        expect(jobToComplete).toBeInstanceOf(Function);
      });

      it("calls updateDeferredReply with historical playlist embed", async () => {
        const interaction = aFakeMapsInteractionWith([
          { name: "playlist", value: MapsPlaylistType.HCS_HISTORICAL, type: ApplicationCommandOptionType.String },
        ]);
        const { jobToComplete } = command.execute(interaction);

        await jobToComplete?.();

        const [, data] = updateDeferredReplySpy.mock.calls[0] as [string, APIInteractionResponseCallbackData];
        const embed = data.embeds?.[0];

        expect(embed).toBeDefined();
        expect(embed?.title).toContain(MapsPlaylistType.HCS_HISTORICAL);
        expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(5);
      });

      it("calls updateDeferredReply with current playlist embed by default", async () => {
        const interaction = aFakeMapsInteractionWith();
        const { jobToComplete } = command.execute(interaction);

        await jobToComplete?.();

        const [, data] = updateDeferredReplySpy.mock.calls[0] as [string, APIInteractionResponseCallbackData];
        const embed = data.embeds?.[0];

        expect(embed).toBeDefined();
        expect(embed?.title).toContain(MapsPlaylistType.HCS_CURRENT);
        expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(5);
      });
    });
  });

  describe("execute(): message component interactions", () => {
    describe("count select", () => {
      it("regenerates and saves a 13-map draft", async () => {
        const generateMapsSpy = vi.spyOn(services.haloService, "generateMaps");
        const interaction = aFakeCountSelectInteraction(13);
        const { jobToComplete } = command.execute(interaction);

        await jobToComplete?.();

        expect(generateMapsSpy).toHaveBeenCalledWith({
          count: 13,
          playlist: MapsPlaylistType.HCS_CURRENT,
          format: MapsFormatType.HCS,
        });
        expect(fakeMapsDrafts.get(`maps:draft:${interaction.message.id}`)?.count).toBe(13);
      });
    });

    describe("button interactions", () => {
      it("returns deferred response and jobToComplete for roll button", () => {
        const interaction = aFakeButtonInteraction(InteractionComponent.Regenerate, MapsPlaylistType.HCS_HISTORICAL);

        const { response, jobToComplete } = command.execute(interaction);

        expect(response).toEqual<APIInteractionResponse>({
          type: InteractionResponseType.DeferredMessageUpdate,
        });
        expect(jobToComplete).toBeInstanceOf(Function);
      });

      it("calls updateDeferredReply with regenerated maps", async () => {
        const interaction = aFakeButtonInteraction(InteractionComponent.Regenerate, MapsPlaylistType.HCS_HISTORICAL);
        const { jobToComplete } = command.execute(interaction);

        await jobToComplete?.();

        const [, data] = updateDeferredReplySpy.mock.calls[0] as [string, APIInteractionResponseCallbackData];
        const embed = data.embeds?.[0];

        expect(embed).toBeDefined();
        expect(embed?.title).toBeDefined();
        expect(embed?.title ?? "").toContain(MapsPlaylistType.HCS_HISTORICAL);
        expect(embed?.fields?.[0]?.value.split("\n")).toHaveLength(5);

        expect(
          getSelectMenu(data.components, InteractionComponent.CountSelect).options.find(
            (option) => option.default === true,
          )?.value,
        ).toBe("5");
      });

      it("calls updateDeferredReply for non-initiate roll buttons", async () => {
        const interaction = aFakeButtonInteraction(InteractionComponent.Regenerate);
        const { jobToComplete } = command.execute(interaction);

        const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);

        await jobToComplete?.();

        expect(updateDeferredReplySpy).toHaveBeenCalledTimes(1);
        expect(createMessageSpy).not.toHaveBeenCalled();

        const [, data] = updateDeferredReplySpy.mock.calls[0] as [string, APIInteractionResponseCallbackData];
        const embed = data.embeds?.[0];

        expect(embed).toBeDefined();
        expect(embed?.title).toBeDefined();

        expect(
          getSelectMenu(data.components, InteractionComponent.CountSelect).options.find(
            (option) => option.default === true,
          )?.value,
        ).toBe("5");
      });

      it("throws for unknown button id", () => {
        const interaction = aFakeButtonInteraction("btn_maps_roll_unknown");

        const { response } = command.execute(interaction);

        expect(response.type).toBe(InteractionResponseType.ChannelMessageWithSource);
        if (response.type === InteractionResponseType.ChannelMessageWithSource) {
          expect(response.data.content).toMatch(/No handler found for component/);
          expect(response.data.flags).toBe(MessageFlags.Ephemeral);
        }
      });

      it("reports an expired KV draft", async () => {
        const interaction = aFakeButtonInteraction(InteractionComponent.Regenerate);
        fakeMapsDrafts.delete(`maps:draft:${interaction.message.id}`);

        const { response, jobToComplete } = command.execute(interaction);

        expect(response.type).toBe(InteractionResponseType.DeferredMessageUpdate);
        const updateErrorSpy = vi.spyOn(services.discordService, "updateDeferredReplyWithError");
        await jobToComplete?.();
        expect(updateErrorSpy).toHaveBeenCalledWith(
          interaction.token,
          expect.objectContaining<Partial<EndUserError>>({
            name: "EndUserError",
            endUserMessage: "Map draft expired; run `/maps` to generate a new one.",
            errorType: EndUserErrorType.WARNING,
            handled: true,
          }),
        );
      });

      describe("initiate button", () => {
        it("returns deferred response and jobToComplete", () => {
          const interaction = aFakeButtonInteraction(InteractionComponent.Initiate);

          const { response, jobToComplete } = command.execute(interaction);

          expect(response).toEqual<APIInteractionResponse>({
            type: InteractionResponseType.DeferredMessageUpdate,
          });
          expect(jobToComplete).toBeInstanceOf(Function);
        });

        it("calls createMessage instead of updateDeferredReply for initiate button", async () => {
          const interaction = aFakeButtonInteraction(InteractionComponent.Initiate);
          const { jobToComplete } = command.execute(interaction);

          const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);

          await jobToComplete?.();

          expect(createMessageSpy).toHaveBeenCalledTimes(1);
          expect(updateDeferredReplySpy).not.toHaveBeenCalled();

          const [channelId, data] = createMessageSpy.mock.calls[0] as [string, APIInteractionResponseCallbackData];
          expect(channelId).toBe(interaction.channel.id);
          expect(data.embeds?.[0]?.title).toContain("Maps: LVT Pro League - Current");

          const actionRow = getButtonRow(data.components);
          expect(actionRow.components).toHaveLength(2);
        });

        it("saves Slayer as the format for an initiated Slayer-only draft", async () => {
          const getMapModesSpy = vi
            .spyOn(services.haloService, "getMapModesForPlaylist")
            .mockReset()
            .mockResolvedValue(["Slayer"]);
          vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);
          const interaction = aFakeButtonInteraction(InteractionComponent.Initiate);
          const { jobToComplete } = command.execute(interaction);

          await jobToComplete?.();

          expect(getMapModesSpy).toHaveBeenCalledWith(MapsPlaylistType.HCS_CURRENT);
          expect(fakeMapsDrafts.get(`maps:draft:${apiMessage.id}`)?.format).toBe(MapsFormatType.SLAYER);
        });
      });
    });

    describe("repost button", () => {
      it("returns deferred response and jobToComplete", () => {
        const interaction = aFakeButtonInteraction(InteractionComponent.Repost);

        const { response, jobToComplete } = command.execute(interaction);

        expect(response).toEqual<APIInteractionResponse>({
          type: InteractionResponseType.DeferredMessageUpdate,
        });
        expect(jobToComplete).toBeInstanceOf(Function);
      });

      it("reposts the maps, then deletes the original message", async () => {
        const interaction = aFakeButtonInteraction(InteractionComponent.Repost);
        if (interaction.member != null) {
          interaction.member.user.id = "reposting-user";
        }
        const { jobToComplete } = command.execute(interaction);

        const createMessageSpy = vi.spyOn(services.discordService, "createMessage").mockResolvedValue(apiMessage);
        const deleteMessageSpy = vi.spyOn(services.discordService, "deleteMessage").mockResolvedValue();

        await jobToComplete?.();

        expect(createMessageSpy).toHaveBeenCalledTimes(1);
        expect(deleteMessageSpy).toHaveBeenCalledTimes(1);

        const [channelId, data] = createMessageSpy.mock.calls[0] as [string, APIInteractionResponseCallbackData];
        expect(channelId).toBe(interaction.channel.id);
        expect(data.embeds?.[0]?.title).toContain("Maps:");
        expect(data.embeds?.[0]?.fields?.at(-1)?.value).toContain("<@reposting-user>");

        const [delChannelId, delMessageId, delReason] = deleteMessageSpy.mock.calls[0] as [string, string, string];
        expect(delChannelId).toBe(interaction.channel.id);
        expect(delMessageId).toBe(interaction.message.id);
        expect(delReason).toBe("Reposting maps");
      });
    });

    describe("playlist select", () => {
      it("returns deferred response and jobToComplete", () => {
        const interaction = aFakePlaylistSelectInteraction(
          MapsPlaylistType.HCS_HISTORICAL,
          3,
          MapsPlaylistType.HCS_HISTORICAL,
        );

        const { response, jobToComplete } = command.execute(interaction);

        expect(response).toEqual<APIInteractionResponse>({
          type: InteractionResponseType.DeferredMessageUpdate,
        });
        expect(jobToComplete).toBeInstanceOf(Function);
      });

      it("calls updateDeferredReply when playlist is switched to historical", async () => {
        const interaction = aFakePlaylistSelectInteraction(
          MapsPlaylistType.HCS_HISTORICAL,
          3,
          MapsPlaylistType.HCS_HISTORICAL,
        );
        const { jobToComplete } = command.execute(interaction);

        await jobToComplete?.();

        const [, data] = updateDeferredReplySpy.mock.calls[0] as [string, APIInteractionResponseCallbackData];
        const embed = data.embeds?.[0];

        expect(embed).toBeDefined();
        expect(typeof embed?.title).toBe("string");
        expect(embed?.title ?? "").toContain(MapsPlaylistType.HCS_HISTORICAL);

        expect(
          getSelectMenu(data.components, InteractionComponent.CountSelect).options.find(
            (option) => option.default === true,
          )?.value,
        ).toBe("3");

        const select = getSelectMenu(data.components, InteractionComponent.PlaylistSelect);
        expect(select.custom_id).toBe(InteractionComponent.PlaylistSelect);
        expect(select.options.find((o) => o.value === MapsPlaylistType.HCS_HISTORICAL.toString())?.default).toBe(true);
        expect(select.options.find((o) => o.value === MapsPlaylistType.HCS_CURRENT.toString())?.default).toBe(false);
      });

      it("calls updateDeferredReply when playlist is switched to current", async () => {
        const interaction = aFakePlaylistSelectInteraction(
          MapsPlaylistType.HCS_CURRENT,
          7,
          MapsPlaylistType.HCS_CURRENT,
        );
        const { jobToComplete } = command.execute(interaction);

        await jobToComplete?.();

        const [, data] = updateDeferredReplySpy.mock.calls[0] as [string, APIInteractionResponseCallbackData];
        const embed = data.embeds?.[0];

        expect(embed).toBeDefined();
        expect(embed?.title).toBeDefined();
        expect(embed?.title).toContain(MapsPlaylistType.HCS_CURRENT);

        expect(
          getSelectMenu(data.components, InteractionComponent.CountSelect).options.find(
            (option) => option.default === true,
          )?.value,
        ).toBe("7");

        const select = getSelectMenu(data.components, InteractionComponent.PlaylistSelect);
        expect(select.custom_id).toBe(InteractionComponent.PlaylistSelect);
        expect(select.options.find((o) => o.value === MapsPlaylistType.HCS_CURRENT.toString())?.default).toBe(true);
        expect(select.options.find((o) => o.value === MapsPlaylistType.HCS_HISTORICAL.toString())?.default).toBe(false);
      });
    });

    describe("format select", () => {
      it("returns deferred response and jobToComplete", () => {
        const interaction = aFakeFormatSelectInteraction(MapsFormatType.RANDOM, 3, MapsPlaylistType.HCS_CURRENT);

        const { response, jobToComplete } = command.execute(interaction);

        expect(response).toEqual<APIInteractionResponse>({
          type: InteractionResponseType.DeferredMessageUpdate,
        });
        expect(jobToComplete).toBeInstanceOf(Function);
      });

      it("calls updateDeferredReply when format is switched to RANDOM", async () => {
        const interaction = aFakeFormatSelectInteraction(
          MapsFormatType.RANDOM,
          5,
          MapsPlaylistType.HCS_CURRENT,
          MapsFormatType.RANDOM,
        );
        const { jobToComplete } = command.execute(interaction);

        await jobToComplete?.();

        const [, data] = updateDeferredReplySpy.mock.calls[0] as [string, APIInteractionResponseCallbackData];
        const embed = data.embeds?.[0];

        expect(embed).toBeDefined();
        expect(typeof embed?.title).toBe("string");
        expect(embed?.title ?? "").toContain(MapsPlaylistType.HCS_CURRENT);

        expect(
          getSelectMenu(data.components, InteractionComponent.CountSelect).options.find(
            (option) => option.default === true,
          )?.value,
        ).toBe("5");

        // Verify format select has RANDOM selected
        const formatSelect = data.components?.find(
          (c) =>
            c.type === ComponentType.ActionRow &&
            c.components.some(
              (comp) =>
                comp.type === ComponentType.StringSelect &&
                comp.custom_id === InteractionComponent.FormatSelect.toString(),
            ),
        );
        expect(formatSelect).toBeDefined();
      });

      it("calls updateDeferredReply when format is switched to OBJECTIVE", async () => {
        const interaction = aFakeFormatSelectInteraction(
          MapsFormatType.OBJECTIVE,
          3,
          MapsPlaylistType.HCS_HISTORICAL,
          MapsFormatType.OBJECTIVE,
        );
        const { jobToComplete } = command.execute(interaction);

        await jobToComplete?.();

        const [, data] = updateDeferredReplySpy.mock.calls[0] as [string, APIInteractionResponseCallbackData];
        const embed = data.embeds?.[0];

        expect(embed).toBeDefined();
        expect(embed?.title).toBeDefined();
        expect(embed?.title).toContain(MapsPlaylistType.HCS_HISTORICAL);

        expect(
          getSelectMenu(data.components, InteractionComponent.CountSelect).options.find(
            (option) => option.default === true,
          )?.value,
        ).toBe("3");
      });

      it("calls updateDeferredReply when format is switched to SLAYER", async () => {
        const interaction = aFakeFormatSelectInteraction(
          MapsFormatType.SLAYER,
          7,
          MapsPlaylistType.HCS_CURRENT,
          MapsFormatType.SLAYER,
        );
        const { jobToComplete } = command.execute(interaction);

        await jobToComplete?.();

        const [, data] = updateDeferredReplySpy.mock.calls[0] as [string, APIInteractionResponseCallbackData];
        const embed = data.embeds?.[0];

        expect(embed).toBeDefined();
        expect(embed?.title).toBeDefined();

        expect(
          getSelectMenu(data.components, InteractionComponent.CountSelect).options.find(
            (option) => option.default === true,
          )?.value,
        ).toBe("7");
      });
    });
  });

  describe("getMapModesForPlaylist integration", () => {
    it("calls getMapModesForPlaylist and passes availableModes to MapsEmbed", async () => {
      const interaction = aFakeMapsInteractionWith();
      const { jobToComplete } = command.execute(interaction);

      const getMapModesForPlaylistSpy = vi.spyOn(services.haloService, "getMapModesForPlaylist");

      await jobToComplete?.();

      expect(getMapModesForPlaylistSpy).toHaveBeenCalledOnce();
      expect(getMapModesForPlaylistSpy).toHaveBeenCalledWith(MapsPlaylistType.HCS_CURRENT);
    });

    it("calls getMapModesForPlaylist with correct playlist when switching playlists", async () => {
      const interaction = aFakePlaylistSelectInteraction(
        MapsPlaylistType.HCS_HISTORICAL,
        5,
        MapsPlaylistType.HCS_HISTORICAL,
      );
      const { jobToComplete } = command.execute(interaction);

      const getMapModesForPlaylistSpy = vi.spyOn(services.haloService, "getMapModesForPlaylist");

      await jobToComplete?.();

      expect(getMapModesForPlaylistSpy).toHaveBeenCalledOnce();
      expect(getMapModesForPlaylistSpy).toHaveBeenCalledWith(MapsPlaylistType.HCS_HISTORICAL);
    });
  });

  describe("error handling in jobToComplete", () => {
    let logErrorSpy: MockInstance;
    let updateDeferredReplyWithErrorSpy: MockInstance;

    beforeEach(() => {
      logErrorSpy = vi.spyOn(services.logService, "error");
      updateDeferredReplyWithErrorSpy = vi
        .spyOn(services.discordService, "updateDeferredReplyWithError")
        .mockResolvedValue(apiMessage);
    });

    describe("application command errors", () => {
      it("logs error and calls updateDeferredReplyWithError when generateMaps fails", async () => {
        const testError = new Error("Failed to generate maps");
        vi.spyOn(services.haloService, "generateMaps").mockRejectedValue(testError);

        const interaction = aFakeMapsInteractionWith();
        const { jobToComplete } = command.execute(interaction);

        await jobToComplete?.();

        expect(logErrorSpy).toHaveBeenCalledWith(testError);
        expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith("fake-token", testError);
        expect(updateDeferredReplySpy).not.toHaveBeenCalled();
      });

      it("logs error and calls updateDeferredReplyWithError when getMapModesForPlaylist fails", async () => {
        const testError = new Error("Failed to fetch map modes");
        vi.spyOn(services.haloService, "getMapModesForPlaylist").mockRejectedValue(testError);

        const interaction = aFakeMapsInteractionWith();
        const { jobToComplete } = command.execute(interaction);

        await jobToComplete?.();

        expect(logErrorSpy).toHaveBeenCalledWith(testError);
        expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith("fake-token", testError);
        expect(updateDeferredReplySpy).not.toHaveBeenCalled();
      });

      it("logs error and calls updateDeferredReplyWithError when updateDeferredReply fails", async () => {
        const testError = new Error("Failed to update reply");
        updateDeferredReplySpy.mockRejectedValue(testError);

        const interaction = aFakeMapsInteractionWith();
        const { jobToComplete } = command.execute(interaction);

        await jobToComplete?.();

        expect(logErrorSpy).toHaveBeenCalledWith(testError);
        expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith("fake-token", testError);
      });
    });

    describe("button interaction errors", () => {
      it("logs error and calls updateDeferredReplyWithError when roll button fails", async () => {
        const testError = new Error("Failed to regenerate maps");
        vi.spyOn(services.haloService, "generateMaps").mockRejectedValue(testError);

        const interaction = aFakeButtonInteraction(InteractionComponent.Regenerate);
        const { jobToComplete } = command.execute(interaction);

        await jobToComplete?.();

        expect(logErrorSpy).toHaveBeenCalledWith(testError);
        expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith("fake-token", testError);
        expect(updateDeferredReplySpy).not.toHaveBeenCalled();
      });

      it("logs error and calls updateDeferredReplyWithError when initiate button createMessage fails", async () => {
        const testError = new Error("Failed to create message");
        vi.spyOn(services.discordService, "createMessage").mockRejectedValue(testError);

        const interaction = aFakeButtonInteraction(InteractionComponent.Initiate);
        const { jobToComplete } = command.execute(interaction);

        await jobToComplete?.();

        expect(logErrorSpy).toHaveBeenCalledWith(testError);
        expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith("fake-token", testError);
      });
    });

    describe("playlist select errors", () => {
      it("logs error and calls updateDeferredReplyWithError when playlist change fails", async () => {
        const testError = new Error("Failed to change playlist");
        vi.spyOn(services.haloService, "generateMaps").mockRejectedValue(testError);

        const interaction = aFakePlaylistSelectInteraction(MapsPlaylistType.HCS_HISTORICAL);
        const { jobToComplete } = command.execute(interaction);

        await jobToComplete?.();

        expect(logErrorSpy).toHaveBeenCalledWith(testError);
        expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith("fake-token", testError);
        expect(updateDeferredReplySpy).not.toHaveBeenCalled();
      });
    });

    describe("format select errors", () => {
      it("logs error and calls updateDeferredReplyWithError when format change fails", async () => {
        const testError = new Error("Failed to change format");
        vi.spyOn(services.haloService, "generateMaps").mockRejectedValue(testError);

        const interaction = aFakeFormatSelectInteraction(MapsFormatType.RANDOM);
        const { jobToComplete } = command.execute(interaction);

        await jobToComplete?.();

        expect(logErrorSpy).toHaveBeenCalledWith(testError);
        expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith("fake-token", testError);
        expect(updateDeferredReplySpy).not.toHaveBeenCalled();
      });
    });
  });
});
