import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  APIApplicationCommandInteraction,
  APIMessageComponentButtonInteraction,
  APIMessageComponentSelectMenuInteraction,
  APIMessageTopLevelComponent,
} from "discord-api-types/v10";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  InteractionType,
  Locale,
  MessageType,
  PermissionFlagsBits,
} from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import {
  aWizardStringSelectWith,
  fakeBaseAPIApplicationCommandInteraction,
  fakeButtonClickInteraction,
} from "../../../services/discord/fakes/data";
import { LeaderboardCommand } from "../leaderboard";

const INTERACTION_PREV_PAGE = "btn_leaderboard_prev";
const INTERACTION_NEXT_PAGE = "btn_leaderboard_next";
const INTERACTION_METRIC_SELECT = "select_leaderboard_metric";
const INTERACTION_WINDOW_SELECT = "select_leaderboard_window";

function aStateComponentsWith(url: string): APIMessageTopLevelComponent[] {
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          style: ButtonStyle.Link,
          label: "Open in browser",
          url,
        },
      ],
    },
  ];
}

function getBrowserUrlFromComponents(components: APIMessageTopLevelComponent[] | undefined): string | null {
  if (components == null) {
    return null;
  }

  for (const component of components) {
    if (component.type !== ComponentType.ActionRow) {
      continue;
    }

    for (const child of component.components) {
      if (child.type !== ComponentType.Button || child.style !== ButtonStyle.Link) {
        continue;
      }

      if (child.url !== "") {
        return child.url;
      }
    }
  }

  return null;
}

describe("LeaderboardCommand", () => {
  let env: Env;
  let command: LeaderboardCommand;
  let services: ReturnType<typeof installFakeServicesWith>;

  beforeEach(() => {
    env = aFakeEnvWith();
    services = installFakeServicesWith({ env });
    command = new LeaderboardCommand(services, env);
    vi.spyOn(services.discordService, "computeMemberPermissions").mockResolvedValue(PermissionFlagsBits.ManageGuild);
  });

  it("registers leaderboard show subcommand", () => {
    const [slashCommand] = command.commands;

    expect(slashCommand?.type).toBe(ApplicationCommandType.ChatInput);
    expect(slashCommand?.name).toBe("leaderboard");

    const subcommands = slashCommand?.options;
    expect(subcommands).toHaveLength(1);
    expect(subcommands?.[0]?.name).toBe("show");
  });

  it("fetches leaderboard data and updates deferred reply with controls and browser URL", async () => {
    const mappedOptions = new Map<string, string | number>();
    mappedOptions.set("queue_channel", "queue-123");
    mappedOptions.set("window", LeaderboardWindow.OneMonth);
    mappedOptions.set("metric", LeaderboardMetric.Kills);
    mappedOptions.set("page", 2);
    mappedOptions.set("min_games_played", 3);

    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "show",
      options: [],
      mappedOptions,
    });
    const getLeaderboardSpy = vi.spyOn(services.leaderboardService, "getLeaderboard").mockResolvedValue({
      guildId: "guild-123",
      queueChannelId: "queue-123",
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.Kills,
      minGamesPlayed: 3,
      page: 2,
      pageSize: 10,
      total: 23,
      rows: [
        {
          rank: 11,
          xboxXuid: "xuid-1",
          discordUserId: "discord-1",
          gamertag: "Alpha",
          seriesPlayed: 3,
          seriesWins: 2,
          gamesPlayed: 9,
          metricValue: 44,
        },
      ],
    });
    const updateDeferredReplySpy = vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
      id: "message-id",
      channel_id: "channel-id",
      content: "",
      timestamp: "2026-08-12T00:00:00.000Z",
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      pinned: false,
      type: MessageType.Default,
      author: {
        id: "bot-id",
        username: "Guilty Spark",
        discriminator: "0000",
        avatar: null,
        global_name: null,
      },
      components: [],
    });

    const interaction: APIApplicationCommandInteraction = {
      ...fakeBaseAPIApplicationCommandInteraction,
      type: InteractionType.ApplicationCommand,
      guild_id: "guild-123",
      data: {
        id: "fake-command-id",
        name: "leaderboard",
        type: ApplicationCommandType.ChatInput,
        options: [
          {
            type: ApplicationCommandOptionType.Subcommand,
            name: "show",
            options: [],
          },
        ],
      },
    };

    const result = command.execute(interaction);

    expect(result.response.type).toBe(InteractionResponseType.DeferredChannelMessageWithSource);
    await result.jobToComplete?.();

    expect(getLeaderboardSpy).toHaveBeenCalledWith({
      guildId: "guild-123",
      queueChannelId: "queue-123",
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.Kills,
      page: 2,
      pageSize: 10,
      minGamesPlayed: 3,
    });

    const [token, payload] = Preconditions.checkExists(updateDeferredReplySpy.mock.calls[0]);
    expect(token).toBe(interaction.token);
    expect(payload.embeds?.[0]?.title).toBe("Leaderboard - Queue <#queue-123>");
    const linkUrl = getBrowserUrlFromComponents(payload.components);
    expect(linkUrl).toContain("guildId=guild-123");
    expect(linkUrl).toContain("queueChannelId=queue-123");
    expect(linkUrl).toContain("window=1M");
    expect(linkUrl).toContain("metric=KILLS");
    expect(linkUrl).toContain("page=2");
  });

  it("prefers guild locale over user locale for leaderboard formatting", async () => {
    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "show",
      options: [],
      mappedOptions: new Map<string, string | number>([["metric", LeaderboardMetric.Accuracy]]),
    });
    const updateDeferredReplySpy = vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
      id: "message-id",
      channel_id: "channel-id",
      content: "",
      timestamp: "2026-08-12T00:00:00.000Z",
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      pinned: false,
      type: MessageType.Default,
      author: {
        id: "bot-id",
        username: "Guilty Spark",
        discriminator: "0000",
        avatar: null,
        global_name: null,
      },
      components: [],
    });
    vi.spyOn(services.leaderboardService, "getLeaderboard").mockResolvedValue({
      guildId: "guild-123",
      queueChannelId: null,
      window: LeaderboardWindow.ThreeMonths,
      metric: LeaderboardMetric.Accuracy,
      minGamesPlayed: 0,
      page: 1,
      pageSize: 10,
      total: 1,
      rows: [
        {
          rank: 1,
          xboxXuid: "xuid-1",
          discordUserId: "discord-1",
          gamertag: "Alpha",
          seriesPlayed: 1,
          seriesWins: 1,
          gamesPlayed: 1,
          metricValue: 12.5,
        },
      ],
    });

    const interaction: APIApplicationCommandInteraction = {
      ...fakeBaseAPIApplicationCommandInteraction,
      type: InteractionType.ApplicationCommand,
      guild_id: "guild-123",
      locale: Locale.EnglishUS,
      guild_locale: Locale.French,
      data: {
        id: "fake-command-id",
        name: "leaderboard",
        type: ApplicationCommandType.ChatInput,
        options: [
          {
            type: ApplicationCommandOptionType.Subcommand,
            name: "show",
            options: [],
          },
        ],
      },
    };

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    const [, payload] = Preconditions.checkExists(updateDeferredReplySpy.mock.calls[0]);
    expect(payload.embeds?.[0]?.fields?.[0]?.value).toContain("1. <@discord-1> (Alpha) - 12,5%");
  });

  it("uses service defaults when leaderboard options are omitted", async () => {
    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "show",
      options: [],
      mappedOptions: new Map<string, string | number>(),
    });

    const getLeaderboardSpy = vi.spyOn(services.leaderboardService, "getLeaderboard").mockResolvedValue({
      guildId: "guild-123",
      queueChannelId: null,
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.Kda,
      minGamesPlayed: 2,
      page: 1,
      pageSize: 10,
      total: 0,
      rows: [],
    });
    vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
      ...fakeButtonClickInteraction.message,
      type: MessageType.Default,
    });

    const interaction: APIApplicationCommandInteraction = {
      ...fakeBaseAPIApplicationCommandInteraction,
      type: InteractionType.ApplicationCommand,
      guild_id: "guild-123",
      data: {
        id: "fake-command-id",
        name: "leaderboard",
        type: ApplicationCommandType.ChatInput,
        options: [
          {
            type: ApplicationCommandOptionType.Subcommand,
            name: "show",
            options: [],
          },
        ],
      },
    };

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(getLeaderboardSpy).toHaveBeenCalledWith({
      guildId: "guild-123",
      page: 1,
      pageSize: 10,
    });
  });

  it("updates deferred reply with error when leaderboard command is used outside a guild", async () => {
    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "show",
      options: [],
      mappedOptions: new Map<string, string | number>(),
    });
    const updateDeferredReplyWithErrorSpy = vi
      .spyOn(services.discordService, "updateDeferredReplyWithError")
      .mockResolvedValue(undefined);

    const interaction: APIApplicationCommandInteraction = {
      ...fakeBaseAPIApplicationCommandInteraction,
      type: InteractionType.ApplicationCommand,
      guild_id: "",
      data: {
        id: "fake-command-id",
        name: "leaderboard",
        type: ApplicationCommandType.ChatInput,
        options: [
          {
            type: ApplicationCommandOptionType.Subcommand,
            name: "show",
            options: [],
          },
        ],
      },
    };

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({ endUserMessage: "Leaderboard can only be used inside a server." }),
    );
  });

  it("paginates from interaction state when previous button is pressed", async () => {
    const stateUrl =
      "https://guilty-spark.app/leaderboard?guildId=guild-123&queueChannelId=queue-123&window=3M&metric=KILLS&page=2&minGamesPlayed=4";
    const interaction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(fakeButtonClickInteraction.guild),
        id: "guild-123",
      },
      data: {
        component_type: ComponentType.Button,
        custom_id: INTERACTION_PREV_PAGE,
      },
      message: {
        ...fakeButtonClickInteraction.message,
        components: aStateComponentsWith(stateUrl),
      },
    };

    const getLeaderboardSpy = vi.spyOn(services.leaderboardService, "getLeaderboard").mockResolvedValue({
      guildId: "guild-123",
      queueChannelId: "queue-123",
      window: LeaderboardWindow.ThreeMonths,
      metric: LeaderboardMetric.Kills,
      minGamesPlayed: 4,
      page: 1,
      pageSize: 10,
      total: 11,
      rows: [],
    });
    vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
      ...fakeButtonClickInteraction.message,
      type: MessageType.Default,
    });

    const result = command.execute(interaction);

    expect(result.response.type).toBe(InteractionResponseType.DeferredMessageUpdate);
    await result.jobToComplete?.();

    expect(getLeaderboardSpy).toHaveBeenCalledWith({
      guildId: "guild-123",
      queueChannelId: "queue-123",
      window: LeaderboardWindow.ThreeMonths,
      metric: LeaderboardMetric.Kills,
      page: 1,
      pageSize: 10,
      minGamesPlayed: 4,
    });
  });

  it("paginates from interaction state when next button is pressed", async () => {
    const stateUrl =
      "https://guilty-spark.app/leaderboard?guildId=guild-123&queueChannelId=queue-123&window=3M&metric=KILLS&page=2&minGamesPlayed=4";
    const interaction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(fakeButtonClickInteraction.guild),
        id: "guild-123",
      },
      data: {
        component_type: ComponentType.Button,
        custom_id: INTERACTION_NEXT_PAGE,
      },
      message: {
        ...fakeButtonClickInteraction.message,
        components: aStateComponentsWith(stateUrl),
      },
    };

    const getLeaderboardSpy = vi.spyOn(services.leaderboardService, "getLeaderboard").mockResolvedValue({
      guildId: "guild-123",
      queueChannelId: "queue-123",
      window: LeaderboardWindow.ThreeMonths,
      metric: LeaderboardMetric.Kills,
      minGamesPlayed: 4,
      page: 3,
      pageSize: 10,
      total: 30,
      rows: [],
    });
    vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
      ...fakeButtonClickInteraction.message,
      type: MessageType.Default,
    });

    const result = command.execute(interaction);

    expect(result.response.type).toBe(InteractionResponseType.DeferredMessageUpdate);
    await result.jobToComplete?.();

    expect(getLeaderboardSpy).toHaveBeenCalledWith({
      guildId: "guild-123",
      queueChannelId: "queue-123",
      window: LeaderboardWindow.ThreeMonths,
      metric: LeaderboardMetric.Kills,
      page: 3,
      pageSize: 10,
      minGamesPlayed: 4,
    });
  });

  it("updates deferred reply with error when leaderboard controls are used without manage server permission", async () => {
    vi.spyOn(services.discordService, "computeMemberPermissions").mockResolvedValueOnce(0n);
    const interaction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(fakeButtonClickInteraction.guild),
        id: "guild-123",
      },
      data: {
        component_type: ComponentType.Button,
        custom_id: INTERACTION_NEXT_PAGE,
      },
      message: {
        ...fakeButtonClickInteraction.message,
        components: aStateComponentsWith(
          "https://guilty-spark.app/leaderboard?guildId=guild-123&window=3M&metric=KILLS&page=2",
        ),
      },
    };

    const updateDeferredReplyWithErrorSpy = vi
      .spyOn(services.discordService, "updateDeferredReplyWithError")
      .mockResolvedValue(undefined);
    const getLeaderboardSpy = vi.spyOn(services.leaderboardService, "getLeaderboard");
    const logErrorSpy = vi.spyOn(services.logService, "error");

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(getLeaderboardSpy).not.toHaveBeenCalled();
    expect(logErrorSpy).not.toHaveBeenCalled();
    expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({
        endUserMessage: "You need the Manage Server permission to use leaderboard controls.",
      }),
    );
  });

  it("switches metric from string-select interaction and resets to page 1", async () => {
    const stateUrl =
      "https://guilty-spark.app/leaderboard?guildId=test-guild-id&window=1M&metric=SERIES_WIN_RATE&page=6&minGamesPlayed=0";
    const interaction: APIMessageComponentSelectMenuInteraction = {
      ...aWizardStringSelectWith({ customId: INTERACTION_METRIC_SELECT, value: LeaderboardMetric.Kda }),
      message: {
        ...aWizardStringSelectWith({ customId: INTERACTION_METRIC_SELECT, value: LeaderboardMetric.Kda }).message,
        components: aStateComponentsWith(stateUrl),
      },
    };

    const getLeaderboardSpy = vi.spyOn(services.leaderboardService, "getLeaderboard").mockResolvedValue({
      guildId: "test-guild-id",
      queueChannelId: null,
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.Kda,
      minGamesPlayed: 0,
      page: 1,
      pageSize: 10,
      total: 5,
      rows: [],
    });
    vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
      ...Preconditions.checkExists(interaction.message),
      type: MessageType.Default,
    });

    const result = command.execute(interaction);

    expect(result.response.type).toBe(InteractionResponseType.DeferredMessageUpdate);
    await result.jobToComplete?.();

    expect(getLeaderboardSpy).toHaveBeenCalledWith({
      guildId: "test-guild-id",
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.Kda,
      page: 1,
      pageSize: 10,
      minGamesPlayed: 0,
    });
  });

  it("switches window from string-select interaction and resets to page 1", async () => {
    const stateUrl =
      "https://guilty-spark.app/leaderboard?guildId=test-guild-id&window=1M&metric=KILLS&page=4&minGamesPlayed=2";
    const interaction: APIMessageComponentSelectMenuInteraction = {
      ...aWizardStringSelectWith({ customId: INTERACTION_WINDOW_SELECT, value: LeaderboardWindow.SixMonths }),
      message: {
        ...aWizardStringSelectWith({ customId: INTERACTION_WINDOW_SELECT, value: LeaderboardWindow.SixMonths }).message,
        components: aStateComponentsWith(stateUrl),
      },
    };

    const getLeaderboardSpy = vi.spyOn(services.leaderboardService, "getLeaderboard").mockResolvedValue({
      guildId: "test-guild-id",
      queueChannelId: null,
      window: LeaderboardWindow.SixMonths,
      metric: LeaderboardMetric.Kills,
      minGamesPlayed: 2,
      page: 1,
      pageSize: 10,
      total: 3,
      rows: [],
    });
    vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
      ...Preconditions.checkExists(interaction.message),
      type: MessageType.Default,
    });

    const result = command.execute(interaction);

    expect(result.response.type).toBe(InteractionResponseType.DeferredMessageUpdate);
    await result.jobToComplete?.();

    expect(getLeaderboardSpy).toHaveBeenCalledWith({
      guildId: "test-guild-id",
      window: LeaderboardWindow.SixMonths,
      metric: LeaderboardMetric.Kills,
      page: 1,
      pageSize: 10,
      minGamesPlayed: 2,
    });
  });

  it("renders an explicit empty state message when no players qualify", async () => {
    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "show",
      options: [],
      mappedOptions: new Map<string, string | number>(),
    });
    vi.spyOn(services.leaderboardService, "getLeaderboard").mockResolvedValue({
      guildId: "guild-123",
      queueChannelId: null,
      window: LeaderboardWindow.ThreeMonths,
      metric: LeaderboardMetric.SeriesWinRate,
      minGamesPlayed: 5,
      page: 1,
      pageSize: 10,
      total: 0,
      rows: [],
    });
    const updateDeferredReplySpy = vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
      id: "message-id",
      channel_id: "channel-id",
      content: "",
      timestamp: "2026-08-12T00:00:00.000Z",
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      pinned: false,
      type: MessageType.Default,
      author: {
        id: "bot-id",
        username: "Guilty Spark",
        discriminator: "0000",
        avatar: null,
        global_name: null,
      },
      components: [],
    });

    const interaction: APIApplicationCommandInteraction = {
      ...fakeBaseAPIApplicationCommandInteraction,
      type: InteractionType.ApplicationCommand,
      guild_id: "guild-123",
      data: {
        id: "fake-command-id",
        name: "leaderboard",
        type: ApplicationCommandType.ChatInput,
        options: [
          {
            type: ApplicationCommandOptionType.Subcommand,
            name: "show",
            options: [],
          },
        ],
      },
    };

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    const [, payload] = Preconditions.checkExists(updateDeferredReplySpy.mock.calls[0]);
    expect(payload.embeds?.[0]?.fields?.[0]?.value).toBe("No players qualify for this filter yet.");
  });

  it("re-fetches the last valid page when requested page is out of range", async () => {
    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "show",
      options: [],
      mappedOptions: new Map<string, string | number>([["page", 999]]),
    });
    const getLeaderboardSpy = vi
      .spyOn(services.leaderboardService, "getLeaderboard")
      .mockResolvedValueOnce({
        guildId: "guild-123",
        queueChannelId: null,
        window: LeaderboardWindow.ThreeMonths,
        metric: LeaderboardMetric.SeriesWinRate,
        minGamesPlayed: 5,
        page: 999,
        pageSize: 10,
        total: 12,
        rows: [],
      })
      .mockResolvedValueOnce({
        guildId: "guild-123",
        queueChannelId: null,
        window: LeaderboardWindow.ThreeMonths,
        metric: LeaderboardMetric.SeriesWinRate,
        minGamesPlayed: 5,
        page: 2,
        pageSize: 10,
        total: 12,
        rows: [
          {
            rank: 11,
            xboxXuid: "xuid-2",
            discordUserId: "discord-2",
            gamertag: "Bravo",
            seriesPlayed: 5,
            seriesWins: 4,
            gamesPlayed: 9,
            metricValue: 0.8,
          },
        ],
      });
    const updateDeferredReplySpy = vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
      id: "message-id",
      channel_id: "channel-id",
      content: "",
      timestamp: "2026-08-12T00:00:00.000Z",
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      pinned: false,
      type: MessageType.Default,
      author: {
        id: "bot-id",
        username: "Guilty Spark",
        discriminator: "0000",
        avatar: null,
        global_name: null,
      },
      components: [],
    });

    const interaction: APIApplicationCommandInteraction = {
      ...fakeBaseAPIApplicationCommandInteraction,
      type: InteractionType.ApplicationCommand,
      guild_id: "guild-123",
      data: {
        id: "fake-command-id",
        name: "leaderboard",
        type: ApplicationCommandType.ChatInput,
        options: [
          {
            type: ApplicationCommandOptionType.Subcommand,
            name: "show",
            options: [],
          },
        ],
      },
    };

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(getLeaderboardSpy).toHaveBeenCalledTimes(2);
    expect(getLeaderboardSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        guildId: "guild-123",
        page: 999,
        pageSize: 10,
      }),
    );
    expect(getLeaderboardSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        guildId: "guild-123",
        page: 2,
        pageSize: 10,
      }),
    );

    const [, payload] = Preconditions.checkExists(updateDeferredReplySpy.mock.calls[0]);
    expect(payload.embeds?.[0]?.description).toContain("Page: 2");
    expect(payload.embeds?.[0]?.fields?.[0]?.value).toContain("11. <@discord-2> (Bravo) - 80%");
  });

  it("updates deferred reply with error when leaderboard refresh fails", async () => {
    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "show",
      options: [],
      mappedOptions: new Map<string, string | number>(),
    });
    const error = new Error("Leaderboard service failed");
    vi.spyOn(services.leaderboardService, "getLeaderboard").mockRejectedValue(error);
    const updateDeferredReplyWithErrorSpy = vi
      .spyOn(services.discordService, "updateDeferredReplyWithError")
      .mockResolvedValue(undefined);

    const interaction: APIApplicationCommandInteraction = {
      ...fakeBaseAPIApplicationCommandInteraction,
      type: InteractionType.ApplicationCommand,
      guild_id: "guild-123",
      data: {
        id: "fake-command-id",
        name: "leaderboard",
        type: ApplicationCommandType.ChatInput,
        options: [
          {
            type: ApplicationCommandOptionType.Subcommand,
            name: "show",
            options: [],
          },
        ],
      },
    };

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(interaction.token, error);
  });

  it("updates deferred reply with error when interaction state cannot be parsed", async () => {
    const interaction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(fakeButtonClickInteraction.guild),
        id: "guild-123",
      },
      data: {
        component_type: ComponentType.Button,
        custom_id: INTERACTION_PREV_PAGE,
      },
      message: {
        ...fakeButtonClickInteraction.message,
        components: aStateComponentsWith("https://guilty-spark.app/leaderboard?guildId=guild-123&page=2"),
      },
    };

    const updateDeferredReplyWithErrorSpy = vi
      .spyOn(services.discordService, "updateDeferredReplyWithError")
      .mockResolvedValue(undefined);
    const logErrorSpy = vi.spyOn(services.logService, "error");

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(logErrorSpy).not.toHaveBeenCalled();
    expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledTimes(1);
    expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({
        endUserMessage: "This leaderboard message is missing filter settings. Run /leaderboard show again.",
      }),
    );
  });

  it("updates deferred reply with error when interaction state guildId mismatches the interaction guild", async () => {
    const interaction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(fakeButtonClickInteraction.guild),
        id: "guild-123",
      },
      data: {
        component_type: ComponentType.Button,
        custom_id: INTERACTION_PREV_PAGE,
      },
      message: {
        ...fakeButtonClickInteraction.message,
        components: aStateComponentsWith(
          "https://guilty-spark.app/leaderboard?guildId=guild-999&window=3M&metric=KILLS&page=2",
        ),
      },
    };

    const updateDeferredReplyWithErrorSpy = vi
      .spyOn(services.discordService, "updateDeferredReplyWithError")
      .mockResolvedValue(undefined);

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({ endUserMessage: "This leaderboard interaction does not belong to this server." }),
    );
  });

  it("updates deferred reply with error when interaction message has no components", async () => {
    const interaction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(fakeButtonClickInteraction.guild),
        id: "guild-123",
      },
      data: {
        component_type: ComponentType.Button,
        custom_id: INTERACTION_PREV_PAGE,
      },
      message: {
        ...fakeButtonClickInteraction.message,
        components: [],
      },
    };

    const updateDeferredReplyWithErrorSpy = vi
      .spyOn(services.discordService, "updateDeferredReplyWithError")
      .mockResolvedValue(undefined);

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({
        endUserMessage: "This leaderboard message is missing its interaction context. Run /leaderboard show again.",
      }),
    );
  });

  it("updates deferred reply with error when interaction state has invalid window filter", async () => {
    const interaction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(fakeButtonClickInteraction.guild),
        id: "guild-123",
      },
      data: {
        component_type: ComponentType.Button,
        custom_id: INTERACTION_PREV_PAGE,
      },
      message: {
        ...fakeButtonClickInteraction.message,
        components: aStateComponentsWith(
          "https://guilty-spark.app/leaderboard?guildId=guild-123&window=BAD&metric=KILLS&page=2",
        ),
      },
    };

    const updateDeferredReplyWithErrorSpy = vi
      .spyOn(services.discordService, "updateDeferredReplyWithError")
      .mockResolvedValue(undefined);

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({
        endUserMessage: "This leaderboard message has an invalid window filter. Run /leaderboard show again.",
      }),
    );
  });

  it("updates deferred reply with error when interaction state has invalid metric filter", async () => {
    const interaction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(fakeButtonClickInteraction.guild),
        id: "guild-123",
      },
      data: {
        component_type: ComponentType.Button,
        custom_id: INTERACTION_PREV_PAGE,
      },
      message: {
        ...fakeButtonClickInteraction.message,
        components: aStateComponentsWith(
          "https://guilty-spark.app/leaderboard?guildId=guild-123&window=3M&metric=BAD&page=2",
        ),
      },
    };

    const updateDeferredReplyWithErrorSpy = vi
      .spyOn(services.discordService, "updateDeferredReplyWithError")
      .mockResolvedValue(undefined);

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({
        endUserMessage: "This leaderboard message has an invalid metric filter. Run /leaderboard show again.",
      }),
    );
  });

  it("renders infinity for max-value ratio metrics", async () => {
    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "show",
      options: [],
      mappedOptions: new Map<string, string | number>([["metric", LeaderboardMetric.DamageRatio]]),
    });
    const updateDeferredReplySpy = vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
      id: "message-id",
      channel_id: "channel-id",
      content: "",
      timestamp: "2026-08-12T00:00:00.000Z",
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      pinned: false,
      type: MessageType.Default,
      author: {
        id: "bot-id",
        username: "Guilty Spark",
        discriminator: "0000",
        avatar: null,
        global_name: null,
      },
      components: [],
    });
    vi.spyOn(services.leaderboardService, "getLeaderboard").mockResolvedValue({
      guildId: "guild-123",
      queueChannelId: null,
      window: LeaderboardWindow.ThreeMonths,
      metric: LeaderboardMetric.DamageRatio,
      minGamesPlayed: 0,
      page: 1,
      pageSize: 10,
      total: 1,
      rows: [
        {
          rank: 1,
          xboxXuid: "xuid-1",
          discordUserId: "discord-1",
          gamertag: "Alpha",
          seriesPlayed: 1,
          seriesWins: 1,
          gamesPlayed: 1,
          metricValue: Number.MAX_VALUE,
        },
      ],
    });

    const interaction: APIApplicationCommandInteraction = {
      ...fakeBaseAPIApplicationCommandInteraction,
      type: InteractionType.ApplicationCommand,
      guild_id: "guild-123",
      data: {
        id: "fake-command-id",
        name: "leaderboard",
        type: ApplicationCommandType.ChatInput,
        options: [
          {
            type: ApplicationCommandOptionType.Subcommand,
            name: "show",
            options: [],
          },
        ],
      },
    };

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    const [, payload] = Preconditions.checkExists(updateDeferredReplySpy.mock.calls[0]);
    expect(payload.embeds?.[0]?.fields?.[0]?.value).toContain("1. <@discord-1> (Alpha) - ∞");
  });
});
