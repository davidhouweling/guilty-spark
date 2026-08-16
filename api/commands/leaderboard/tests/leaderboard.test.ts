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
import { LeaderboardMetric, LeaderboardMetricFamily, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeLeaderboardSeriesRow } from "../../../services/database/fakes/database.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import {
  aWizardStringSelectWith,
  fakeBaseAPIApplicationCommandInteraction,
  fakeButtonClickInteraction,
} from "../../../services/discord/fakes/data";
import { LeaderboardCommand } from "../leaderboard";

const INTERACTION_PREV_PAGE = "btn_leaderboard_prev";
const INTERACTION_NEXT_PAGE = "btn_leaderboard_next";
const INTERACTION_FIRST_PAGE = "btn_leaderboard_first";
const INTERACTION_REFRESH = "btn_leaderboard_refresh";
const INTERACTION_LAST_PAGE = "btn_leaderboard_last";
const INTERACTION_METRIC_SELECT = "select_leaderboard_metric_family";
const INTERACTION_LEGACY_METRIC_SELECT = "select_leaderboard_metric";
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
    expect(subcommands).toHaveLength(2);
    expect(subcommands?.[0]?.name).toBe("show");
    expect(subcommands?.[1]?.name).toBe("reset");
  });

  it("previews a queue completion time before saving the reset marker", async () => {
    const mappedOptions = new Map<string, string | number | boolean>([
      ["queue_channel", "queue-123"],
      ["queue_number", 42],
    ]);
    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "reset",
      options: [],
      mappedOptions,
    });
    vi.spyOn(services.databaseService, "getLeaderboardSeriesByQueueNumber").mockResolvedValue(
      aFakeLeaderboardSeriesRow({
        GuildId: "guild-123",
        QueueNumber: 42,
        QueueChannelId: "queue-123",
        CompletedAt: 1_723_600_000,
      }),
    );
    const upsertSpy = vi.spyOn(services.databaseService, "upsertLeaderboardResetMarker").mockResolvedValue(undefined);
    const updateSpy = vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
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
        options: [{ type: ApplicationCommandOptionType.Subcommand, name: "reset", options: [] }],
      },
    };

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(upsertSpy).not.toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({
        embeds: [expect.objectContaining({ title: "Leaderboard reset", color: 13_938_487 })],
        components: [expect.any(Object)],
      }),
    );
  });

  it("saves the reset marker when confirmation button is clicked", async () => {
    const resetAt = 1_723_600_000;
    const interaction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(fakeButtonClickInteraction.guild),
        id: "guild-123",
      },
      data: {
        component_type: ComponentType.Button,
        custom_id: `btn_leaderboard_reset_confirm:guild-123:queue-123:${resetAt.toString(36)}`,
      },
    };
    const upsertSpy = vi.spyOn(services.databaseService, "upsertLeaderboardResetMarker").mockResolvedValue(undefined);
    const refreshPostsSpy = vi.spyOn(services.leaderboardService, "refreshPostsForReset").mockResolvedValue(undefined);
    const updateSpy = vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
      ...fakeButtonClickInteraction.message,
      type: MessageType.Default,
    });

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ GuildId: "guild-123", QueueChannelId: "queue-123", ResetAt: resetAt }),
    );
    expect(refreshPostsSpy).toHaveBeenCalledWith("guild-123", "queue-123");
    expect(updateSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({ embeds: [expect.objectContaining({ title: "Leaderboard reset" })], components: [] }),
    );
  });

  it("updates the reset confirmation before refreshing leaderboard posts", async () => {
    const resetAt = 1_723_600_000;
    const interaction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(fakeButtonClickInteraction.guild),
        id: "guild-123",
      },
      data: {
        component_type: ComponentType.Button,
        custom_id: `btn_leaderboard_reset_confirm:guild-123:queue-123:${resetAt.toString(36)}`,
      },
    };
    const deferredRefresh = {
      resolve: (): void => {
        throw new Error("Expected refresh resolver to be initialized");
      },
    };
    const refreshPromise = new Promise<void>((resolve) => {
      deferredRefresh.resolve = resolve;
    });
    vi.spyOn(services.databaseService, "upsertLeaderboardResetMarker").mockResolvedValue(undefined);
    const refreshSpy = vi.spyOn(services.leaderboardService, "refreshPostsForReset").mockReturnValue(refreshPromise);
    const updateSpy = vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
      ...fakeButtonClickInteraction.message,
      type: MessageType.Default,
    });

    const result = command.execute(interaction);
    const completion = result.jobToComplete?.();

    await vi.waitFor(() => {
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.invocationCallOrder[0]).toBeLessThan(
      Preconditions.checkExists(refreshSpy.mock.invocationCallOrder[0]),
    );

    deferredRefresh.resolve();
    await completion;
  });

  it("allows admins to reset leaderboards without Manage Server", async () => {
    vi.spyOn(services.discordService, "computeMemberPermissions").mockResolvedValue(PermissionFlagsBits.Administrator);
    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "reset",
      options: [],
      mappedOptions: new Map<string, string | number | boolean>(),
    });
    const updateSpy = vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
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
        options: [{ type: ApplicationCommandOptionType.Subcommand, name: "reset", options: [] }],
      },
    };

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(updateSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({ embeds: [expect.objectContaining({ title: "Leaderboard reset" })] }),
    );
  });

  it("rejects reset requests without Manage Server or Administrator", async () => {
    vi.spyOn(services.discordService, "computeMemberPermissions").mockResolvedValue(0n);
    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "reset",
      options: [],
      mappedOptions: new Map<string, string | number | boolean>(),
    });
    const errorSpy = vi.spyOn(services.discordService, "updateDeferredReplyWithError").mockResolvedValue(undefined);
    const interaction: APIApplicationCommandInteraction = {
      ...fakeBaseAPIApplicationCommandInteraction,
      type: InteractionType.ApplicationCommand,
      guild_id: "guild-123",
      data: {
        id: "fake-command-id",
        name: "leaderboard",
        type: ApplicationCommandType.ChatInput,
        options: [{ type: ApplicationCommandOptionType.Subcommand, name: "reset", options: [] }],
      },
    };

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(errorSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({
        endUserMessage: "You need the Manage Server or Administrator permission to reset leaderboards.",
      }),
    );
  });

  it("rejects tampered reset confirmations that point to a future date", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 60;
    const interaction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(fakeButtonClickInteraction.guild),
        id: "guild-123",
      },
      data: {
        component_type: ComponentType.Button,
        custom_id: `btn_leaderboard_reset_confirm:guild-123:queue-123:${resetAt.toString(36)}`,
      },
    };
    const upsertSpy = vi.spyOn(services.databaseService, "upsertLeaderboardResetMarker").mockResolvedValue(undefined);
    const errorSpy = vi.spyOn(services.discordService, "updateDeferredReplyWithError").mockResolvedValue(undefined);

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(upsertSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({ endUserMessage: "Reset date cannot be in the future." }),
    );
  });

  it("rejects tampered reset confirmations with an empty queue segment", async () => {
    const resetAt = 1_723_600_000;
    const interaction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(fakeButtonClickInteraction.guild),
        id: "guild-123",
      },
      data: {
        component_type: ComponentType.Button,
        custom_id: `btn_leaderboard_reset_confirm:guild-123::${resetAt.toString(36)}`,
      },
    };
    const upsertSpy = vi.spyOn(services.databaseService, "upsertLeaderboardResetMarker").mockResolvedValue(undefined);
    const errorSpy = vi.spyOn(services.discordService, "updateDeferredReplyWithError").mockResolvedValue(undefined);

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(upsertSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({
        endUserMessage: "This leaderboard control interaction is invalid. Run /leaderboard show again.",
      }),
    );
  });

  it("rejects tampered reset confirmations with extra custom id segments", async () => {
    const resetAt = 1_723_600_000;
    const interaction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(fakeButtonClickInteraction.guild),
        id: "guild-123",
      },
      data: {
        component_type: ComponentType.Button,
        custom_id: `btn_leaderboard_reset_confirm:guild-123:queue-123:${resetAt.toString(36)}:extra`,
      },
    };
    const upsertSpy = vi.spyOn(services.databaseService, "upsertLeaderboardResetMarker").mockResolvedValue(undefined);
    const errorSpy = vi.spyOn(services.discordService, "updateDeferredReplyWithError").mockResolvedValue(undefined);

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(upsertSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({
        endUserMessage: "This leaderboard control interaction is invalid. Run /leaderboard show again.",
      }),
    );
  });

  it("rejects reset requests that supply both date and queue number", async () => {
    const mappedOptions = new Map<string, string | number | boolean>([
      ["date", "2024-08-14"],
      ["queue_number", 42],
    ]);
    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "reset",
      options: [],
      mappedOptions,
    });
    const errorSpy = vi.spyOn(services.discordService, "updateDeferredReplyWithError").mockResolvedValue(undefined);
    const interaction: APIApplicationCommandInteraction = {
      ...fakeBaseAPIApplicationCommandInteraction,
      type: InteractionType.ApplicationCommand,
      guild_id: "guild-123",
      data: {
        id: "fake-command-id",
        name: "leaderboard",
        type: ApplicationCommandType.ChatInput,
        options: [{ type: ApplicationCommandOptionType.Subcommand, name: "reset", options: [] }],
      },
    };

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(errorSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({ endUserMessage: "Only one reset boundary can be used: date or queue number." }),
    );
  });

  it("fetches leaderboard data and updates deferred reply with stateful controls", async () => {
    const mappedOptions = new Map<string, string | number>();
    mappedOptions.set("queue_channel", "queue-123");
    mappedOptions.set("window", LeaderboardWindow.OneMonth);
    mappedOptions.set("metric_family", LeaderboardMetricFamily.Kills);
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
          gameWins: 6,
          metricValue: 44,
        },
      ],
    });
    const upsertLeaderboardPostSpy = vi
      .spyOn(services.databaseService, "upsertLeaderboardPost")
      .mockResolvedValue(undefined);
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
    expect(upsertLeaderboardPostSpy).toHaveBeenCalledWith({
      ChannelId: "channel-id",
      MessageId: "message-id",
      GuildId: "guild-123",
      QueueChannelId: "queue-123",
    });
    expect(payload.components?.[0]).toEqual({
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          style: ButtonStyle.Secondary,
          custom_id: `${INTERACTION_FIRST_PAGE}:guild-123:queue-123:1M:KILLS:2:3`,
          emoji: { name: "⏮️" },
          disabled: false,
        },
        {
          type: ComponentType.Button,
          style: ButtonStyle.Secondary,
          custom_id: `${INTERACTION_PREV_PAGE}:guild-123:queue-123:1M:KILLS:2:3`,
          emoji: { name: "◀️" },
          disabled: false,
        },
        {
          type: ComponentType.Button,
          style: ButtonStyle.Secondary,
          custom_id: `${INTERACTION_REFRESH}:guild-123:queue-123:1M:KILLS:2:3`,
          emoji: { name: "🔄" },
          disabled: false,
        },
        {
          type: ComponentType.Button,
          style: ButtonStyle.Secondary,
          custom_id: `${INTERACTION_NEXT_PAGE}:guild-123:queue-123:1M:KILLS:2:3`,
          emoji: { name: "▶️" },
          disabled: false,
        },
        {
          type: ComponentType.Button,
          style: ButtonStyle.Secondary,
          custom_id: `${INTERACTION_LAST_PAGE}:guild-123:queue-123:1M:KILLS:2:3`,
          emoji: { name: "⏭️" },
          disabled: false,
        },
      ],
    });
    expect(getBrowserUrlFromComponents(payload.components)).toBeNull();
  });

  it("omits controls and skips post registration for locked leaderboard show", async () => {
    const mappedOptions = new Map<string, string | number | boolean>();
    mappedOptions.set("locked", true);

    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "show",
      options: [],
      mappedOptions,
    });
    const getLeaderboardSpy = vi.spyOn(services.leaderboardService, "getLeaderboard").mockResolvedValue({
      guildId: "guild-123",
      queueChannelId: null,
      window: LeaderboardWindow.ThreeMonths,
      metric: LeaderboardMetric.SeriesWinRate,
      minGamesPlayed: 0,
      page: 1,
      pageSize: 10,
      total: 0,
      rows: [],
    });
    const upsertLeaderboardPostSpy = vi
      .spyOn(services.databaseService, "upsertLeaderboardPost")
      .mockResolvedValue(undefined);
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
      page: 1,
      pageSize: 10,
    });
    expect(upsertLeaderboardPostSpy).not.toHaveBeenCalled();
    const [, payload] = Preconditions.checkExists(updateDeferredReplySpy.mock.calls[0]);
    expect(payload.components).toBeUndefined();
  });

  it("prefers guild locale over user locale for leaderboard formatting", async () => {
    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "show",
      options: [],
      mappedOptions: new Map<string, string | number>([["metric_family", LeaderboardMetricFamily.Accuracy]]),
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
          gameWins: 1,
          metricValue: 12.5,
        },
        {
          rank: 2,
          xboxXuid: "xuid-2",
          discordUserId: "discord-2",
          gamertag: "Bravo",
          seriesPlayed: 1,
          seriesWins: 1,
          gamesPlayed: 1,
          gameWins: 1,
          metricValue: 10,
        },
        {
          rank: 3,
          xboxXuid: "xuid-3",
          discordUserId: "discord-3",
          gamertag: "Charlie",
          seriesPlayed: 1,
          seriesWins: 1,
          gamesPlayed: 1,
          gameWins: 1,
          metricValue: 7.5,
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
    expect(payload.embeds?.[0]?.fields).toEqual([
      { name: "Rank", value: "🥇\n🥈\n🥉", inline: true },
      { name: "Player", value: "<@discord-1> (Alpha)\n<@discord-2> (Bravo)\n<@discord-3> (Charlie)", inline: true },
      { name: "Accuracy", value: "12,5%\n10%\n7,5%", inline: true },
    ]);
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

  it("keeps successful leaderboard response when post registration fails", async () => {
    const mappedOptions = new Map<string, string | number>();
    mappedOptions.set("queue_channel", "queue-123");
    mappedOptions.set("window", LeaderboardWindow.OneMonth);
    mappedOptions.set("metric_family", LeaderboardMetricFamily.Kills);
    mappedOptions.set("page", 2);
    mappedOptions.set("min_games_played", 3);

    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "show",
      options: [],
      mappedOptions,
    });
    vi.spyOn(services.leaderboardService, "getLeaderboard").mockResolvedValue({
      guildId: "guild-123",
      queueChannelId: "queue-123",
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.Kills,
      minGamesPlayed: 3,
      page: 2,
      pageSize: 10,
      total: 23,
      rows: [],
    });
    vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
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
    vi.spyOn(services.databaseService, "upsertLeaderboardPost").mockRejectedValue(new Error("D1 unavailable"));
    const updateDeferredReplyWithErrorSpy = vi
      .spyOn(services.discordService, "updateDeferredReplyWithError")
      .mockResolvedValue(undefined);
    const warnSpy = vi.spyOn(services.logService, "warn");

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

    expect(updateDeferredReplyWithErrorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.any(Error), expect.any(Map));
    const [warnMessage, warnContext] = Preconditions.checkExists(warnSpy.mock.calls[0]);
    expect(warnMessage).toBeInstanceOf(Error);
    const context = Preconditions.checkExists(warnContext);
    expect(context.get("guildId")).toBe("guild-123");
    expect(context.get("queueChannelId")).toBe("queue-123");
    expect(context.get("channelId")).toBe("channel-id");
    expect(context.get("messageId")).toBe("message-id");
    expect(context.get("reason")).toBe("Failed to register leaderboard post");
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

  it("updates deferred reply with error when aggregation is provided for an implicit-aggregation family", async () => {
    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "show",
      options: [],
      mappedOptions: new Map<string, string | number>([
        ["metric_family", LeaderboardMetricFamily.Kda],
        ["aggregation", "TOTAL"],
      ]),
    });
    const updateDeferredReplyWithErrorSpy = vi
      .spyOn(services.discordService, "updateDeferredReplyWithError")
      .mockResolvedValue(undefined);
    const getLeaderboardSpy = vi.spyOn(services.leaderboardService, "getLeaderboard");

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

    expect(getLeaderboardSpy).not.toHaveBeenCalled();
    expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({
        endUserMessage: "This aggregation is not valid for the selected stat family.",
      }),
    );
  });

  it("paginates from interaction state when previous button is pressed", async () => {
    const controlId = "btn_leaderboard_prev:guild-123:queue-123:3M:KILLS:2:4";
    const interaction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(fakeButtonClickInteraction.guild),
        id: "guild-123",
      },
      data: {
        component_type: ComponentType.Button,
        custom_id: controlId,
      },
      message: {
        ...fakeButtonClickInteraction.message,
        components: [],
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

  it("resolves and fetches the last available leaderboard page", async () => {
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
        custom_id: INTERACTION_LAST_PAGE,
      },
      message: {
        ...fakeButtonClickInteraction.message,
        components: aStateComponentsWith(stateUrl),
      },
    };

    const getLeaderboardSpy = vi
      .spyOn(services.leaderboardService, "getLeaderboard")
      .mockResolvedValueOnce({
        guildId: "guild-123",
        queueChannelId: "queue-123",
        window: LeaderboardWindow.ThreeMonths,
        metric: LeaderboardMetric.Kills,
        minGamesPlayed: 4,
        page: 1,
        pageSize: 10,
        total: 23,
        rows: [],
      })
      .mockResolvedValueOnce({
        guildId: "guild-123",
        queueChannelId: "queue-123",
        window: LeaderboardWindow.ThreeMonths,
        metric: LeaderboardMetric.Kills,
        minGamesPlayed: 4,
        page: 3,
        pageSize: 10,
        total: 23,
        rows: [],
      });
    vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
      ...fakeButtonClickInteraction.message,
      type: MessageType.Default,
    });

    const result = command.execute(interaction);

    expect(result.response.type).toBe(InteractionResponseType.DeferredMessageUpdate);
    await result.jobToComplete?.();

    expect(getLeaderboardSpy).toHaveBeenNthCalledWith(1, {
      guildId: "guild-123",
      queueChannelId: "queue-123",
      window: LeaderboardWindow.ThreeMonths,
      metric: LeaderboardMetric.Kills,
      page: 1,
      pageSize: 10,
      minGamesPlayed: 4,
    });
    expect(getLeaderboardSpy).toHaveBeenNthCalledWith(2, {
      guildId: "guild-123",
      queueChannelId: "queue-123",
      window: LeaderboardWindow.ThreeMonths,
      metric: LeaderboardMetric.Kills,
      page: 3,
      pageSize: 10,
      minGamesPlayed: 4,
    });
  });

  it("allows leaderboard controls without manage server permission", async () => {
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

    const getLeaderboardSpy = vi.spyOn(services.leaderboardService, "getLeaderboard").mockResolvedValue({
      guildId: "guild-123",
      queueChannelId: null,
      window: LeaderboardWindow.ThreeMonths,
      metric: LeaderboardMetric.Kills,
      minGamesPlayed: 0,
      page: 3,
      pageSize: 10,
      total: 0,
      rows: [],
    });
    vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
      ...Preconditions.checkExists(interaction.message),
      type: MessageType.Default,
    });

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(getLeaderboardSpy).toHaveBeenCalledOnce();
  });

  it("updates deferred reply with error when page-change interaction payload has wrong component type", async () => {
    const interaction: APIMessageComponentSelectMenuInteraction = {
      ...aWizardStringSelectWith({ customId: INTERACTION_PREV_PAGE, value: "unused" }),
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(
          aWizardStringSelectWith({ customId: INTERACTION_PREV_PAGE, value: "unused" }).guild,
        ),
        id: "guild-123",
      },
      message: {
        ...aWizardStringSelectWith({ customId: INTERACTION_PREV_PAGE, value: "unused" }).message,
        components: aStateComponentsWith(
          "https://guilty-spark.app/leaderboard?guildId=guild-123&window=3M&metric=KILLS&page=2",
        ),
      },
    };
    const updateDeferredReplyWithErrorSpy = vi
      .spyOn(services.discordService, "updateDeferredReplyWithError")
      .mockResolvedValue(undefined);
    const getLeaderboardSpy = vi.spyOn(services.leaderboardService, "getLeaderboard");

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(getLeaderboardSpy).not.toHaveBeenCalled();
    expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({
        endUserMessage: "This leaderboard control interaction is invalid. Run /leaderboard show again.",
      }),
      { preserveMessage: interaction.message, errorEmbedFooter: "Temporary leaderboard error" },
    );
  });

  it("updates deferred reply with error when metric selection interaction payload is invalid", async () => {
    const interaction: APIMessageComponentSelectMenuInteraction = {
      ...aWizardStringSelectWith({ customId: INTERACTION_METRIC_SELECT, value: LeaderboardMetricFamily.Kills }),
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(
          aWizardStringSelectWith({ customId: INTERACTION_METRIC_SELECT, value: LeaderboardMetricFamily.Kills }).guild,
        ),
        id: "guild-123",
      },
      data: {
        component_type: ComponentType.StringSelect,
        custom_id: INTERACTION_METRIC_SELECT,
        values: [],
      },
      message: {
        ...aWizardStringSelectWith({ customId: INTERACTION_METRIC_SELECT, value: LeaderboardMetricFamily.Kills })
          .message,
        components: aStateComponentsWith(
          "https://guilty-spark.app/leaderboard?guildId=guild-123&window=3M&metric=KILLS&page=2",
        ),
      },
    };
    const updateDeferredReplyWithErrorSpy = vi
      .spyOn(services.discordService, "updateDeferredReplyWithError")
      .mockResolvedValue(undefined);
    const getLeaderboardSpy = vi.spyOn(services.leaderboardService, "getLeaderboard");

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(getLeaderboardSpy).not.toHaveBeenCalled();
    expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({
        endUserMessage: "This leaderboard control interaction is invalid. Run /leaderboard show again.",
      }),
      { preserveMessage: interaction.message, errorEmbedFooter: "Temporary leaderboard error" },
    );
  });

  it("updates deferred reply with error when window selection interaction payload is invalid", async () => {
    const interaction: APIMessageComponentButtonInteraction = {
      ...fakeButtonClickInteraction,
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(fakeButtonClickInteraction.guild),
        id: "guild-123",
      },
      data: {
        component_type: ComponentType.Button,
        custom_id: INTERACTION_WINDOW_SELECT,
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

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(getLeaderboardSpy).not.toHaveBeenCalled();
    expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({
        endUserMessage: "This leaderboard control interaction is invalid. Run /leaderboard show again.",
      }),
      { preserveMessage: interaction.message, errorEmbedFooter: "Temporary leaderboard error" },
    );
  });

  it("switches metric from string-select interaction and resets to page 1", async () => {
    const stateUrl =
      "https://guilty-spark.app/leaderboard?guildId=test-guild-id&window=1M&metric=SERIES_WIN_RATE&page=6&minGamesPlayed=0";
    const interaction: APIMessageComponentSelectMenuInteraction = {
      ...aWizardStringSelectWith({ customId: INTERACTION_METRIC_SELECT, value: LeaderboardMetricFamily.Kda }),
      message: {
        ...aWizardStringSelectWith({ customId: INTERACTION_METRIC_SELECT, value: LeaderboardMetricFamily.Kda }).message,
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

  it("switches metric while the reset window is active", async () => {
    const interaction: APIMessageComponentSelectMenuInteraction = {
      ...aWizardStringSelectWith({ customId: INTERACTION_METRIC_SELECT, value: LeaderboardMetricFamily.GamesWinRate }),
      guild_id: "guild-123",
      guild: {
        ...Preconditions.checkExists(
          aWizardStringSelectWith({ customId: INTERACTION_METRIC_SELECT, value: LeaderboardMetricFamily.GamesWinRate })
            .guild,
        ),
        id: "guild-123",
      },
      data: {
        component_type: ComponentType.StringSelect,
        custom_id: `${INTERACTION_METRIC_SELECT}:guild-123:-:RESET:SERIES_WIN_RATE:1:0`,
        values: [LeaderboardMetricFamily.GamesWinRate],
      },
    };
    vi.spyOn(services.databaseService, "getLeaderboardResetMarker").mockResolvedValue({
      GuildId: "guild-123",
      QueueChannelId: null,
      ResetAt: 1_723_600_000,
      CreatedAt: 1_723_600_000,
      UpdatedAt: 1_723_600_000,
    });
    const getLeaderboardSpy = vi.spyOn(services.leaderboardService, "getLeaderboard").mockResolvedValue({
      guildId: "guild-123",
      queueChannelId: null,
      window: LeaderboardWindow.LastReset,
      resetAt: 1_723_600_000,
      metric: LeaderboardMetric.GamesWinRate,
      minGamesPlayed: 0,
      page: 1,
      pageSize: 10,
      total: 0,
      rows: [],
    });
    vi.spyOn(services.discordService, "updateDeferredReply").mockResolvedValue({
      ...Preconditions.checkExists(interaction.message),
      type: MessageType.Default,
    });

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(getLeaderboardSpy).toHaveBeenCalledWith(
      expect.objectContaining({ window: LeaderboardWindow.LastReset, metric: LeaderboardMetric.GamesWinRate }),
    );
  });

  it("switches metric from legacy metric string-select interaction and resets to page 1", async () => {
    const stateUrl =
      "https://guilty-spark.app/leaderboard?guildId=test-guild-id&window=1M&metric=AVG_KILLS_PER_SERIES&page=6&minGamesPlayed=0";
    const interaction: APIMessageComponentSelectMenuInteraction = {
      ...aWizardStringSelectWith({ customId: INTERACTION_LEGACY_METRIC_SELECT, value: LeaderboardMetric.ShotsHit }),
      data: {
        component_type: ComponentType.StringSelect,
        custom_id: INTERACTION_LEGACY_METRIC_SELECT,
        values: [LeaderboardMetric.ShotsHit],
      },
      message: {
        ...aWizardStringSelectWith({ customId: INTERACTION_LEGACY_METRIC_SELECT, value: LeaderboardMetric.ShotsHit })
          .message,
        components: aStateComponentsWith(stateUrl),
      },
    };

    const getLeaderboardSpy = vi.spyOn(services.leaderboardService, "getLeaderboard").mockResolvedValue({
      guildId: "test-guild-id",
      queueChannelId: null,
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.AvgShotsHitPerSeries,
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
      metric: LeaderboardMetric.AvgShotsHitPerSeries,
      page: 1,
      pageSize: 10,
      minGamesPlayed: 0,
      queueChannelId: undefined,
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
            gameWins: 6,
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
    expect(payload.embeds?.[0]?.footer?.text).toBe("Page 2 of 2 | Min games: 5 | Total players: 12");
    expect(payload.embeds?.[0]?.fields).toEqual([
      { name: "Rank", value: "#11", inline: true },
      { name: "Player", value: "<@discord-2> (Bravo)", inline: true },
      { name: "Series win rate", value: "80% (4/5)", inline: true },
    ]);
  });

  it("clamps empty leaderboard page to 1 without re-fetching", async () => {
    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "show",
      options: [],
      mappedOptions: new Map<string, string | number>([["page", 999]]),
    });
    const getLeaderboardSpy = vi.spyOn(services.leaderboardService, "getLeaderboard").mockResolvedValue({
      guildId: "guild-123",
      queueChannelId: null,
      window: LeaderboardWindow.ThreeMonths,
      metric: LeaderboardMetric.SeriesWinRate,
      minGamesPlayed: 5,
      page: 999,
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

    expect(getLeaderboardSpy).toHaveBeenCalledTimes(1);
    const [, payload] = Preconditions.checkExists(updateDeferredReplySpy.mock.calls[0]);
    expect(payload.embeds?.[0]?.footer?.text).toBe("Page 1 of 1 | Min games: 5 | Total players: 0");
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
      { preserveMessage: interaction.message, errorEmbedFooter: "Temporary leaderboard error" },
    );
  });

  it("updates deferred reply with error when interaction state URL is malformed", async () => {
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
        components: aStateComponentsWith("https://%/leaderboard?window=3M&metric=KILLS&page=1"),
      },
    };

    const updateDeferredReplyWithErrorSpy = vi
      .spyOn(services.discordService, "updateDeferredReplyWithError")
      .mockResolvedValue(undefined);
    const logErrorSpy = vi.spyOn(services.logService, "error");

    const result = command.execute(interaction);
    await result.jobToComplete?.();

    expect(logErrorSpy).not.toHaveBeenCalled();
    expect(updateDeferredReplyWithErrorSpy).toHaveBeenCalledWith(
      interaction.token,
      expect.objectContaining({
        endUserMessage: "This leaderboard message has invalid filter settings. Run /leaderboard show again.",
      }),
      { preserveMessage: interaction.message, errorEmbedFooter: "Temporary leaderboard error" },
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
      { preserveMessage: interaction.message, errorEmbedFooter: "Temporary leaderboard error" },
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
      { preserveMessage: interaction.message, errorEmbedFooter: "Temporary leaderboard error" },
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
      { preserveMessage: interaction.message, errorEmbedFooter: "Temporary leaderboard error" },
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
      { preserveMessage: interaction.message, errorEmbedFooter: "Temporary leaderboard error" },
    );
  });

  it("renders infinity for max-value ratio metrics", async () => {
    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "show",
      options: [],
      mappedOptions: new Map<string, string | number>([["metric_family", LeaderboardMetricFamily.DamageRatio]]),
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
          gameWins: 1,
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
    expect(payload.embeds?.[0]?.fields).toEqual([
      { name: "Rank", value: "🥇", inline: true },
      { name: "Player", value: "<@discord-1> (Alpha)", inline: true },
      { name: "Damage ratio", value: "∞", inline: true },
    ]);
  });
});
