import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIApplicationCommandInteraction } from "discord-api-types/v10";
import { ApplicationCommandOptionType, ApplicationCommandType, InteractionResponseType, InteractionType } from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { fakeBaseAPIApplicationCommandInteraction } from "../../../services/discord/fakes/data";
import { LeaderboardCommand } from "../leaderboard";

describe("LeaderboardCommand", () => {
  let env: Env;
  let command: LeaderboardCommand;
  let services: ReturnType<typeof installFakeServicesWith>;

  beforeEach(() => {
    env = aFakeEnvWith();
    services = installFakeServicesWith({ env });
    command = new LeaderboardCommand(services, env);
  });

  it("registers leaderboard show subcommand", () => {
    const [slashCommand] = command.commands;

    expect(slashCommand?.type).toBe(ApplicationCommandType.ChatInput);
    expect(slashCommand?.name).toBe("leaderboard");

    const subcommands = slashCommand?.options;
    expect(subcommands).toHaveLength(1);
    expect(subcommands?.[0]?.name).toBe("show");
  });

  it("fetches leaderboard data and updates deferred reply", async () => {
    const mappedOptions = new Map<string, string | number>();
    mappedOptions.set("queue_channel", "queue-123");
    mappedOptions.set("window", LeaderboardWindow.OneMonth);
    mappedOptions.set("metric", LeaderboardMetric.Kills);
    mappedOptions.set("page", 2);
    mappedOptions.set("min_games_played", 3);

    const extractSubcommandSpy = vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
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
      total: 2,
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
      type: 0,
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
    expect(result.jobToComplete).toBeDefined();

    await result.jobToComplete?.();

    expect(extractSubcommandSpy).toHaveBeenCalledWith(interaction, "leaderboard");
    expect(getLeaderboardSpy).toHaveBeenCalledWith({
      guildId: "guild-123",
      queueChannelId: "queue-123",
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.Kills,
      page: 2,
      pageSize: 10,
      minGamesPlayed: 3,
    });
    expect(updateDeferredReplySpy).toHaveBeenCalledTimes(1);
    const [interactionToken, payload] = Preconditions.checkExists(updateDeferredReplySpy.mock.calls[0]);
    expect(interactionToken).toBe(interaction.token);
    expect(payload.embeds?.[0]?.title).toBe("Leaderboard - Queue <#queue-123>");
  });

  it("returns deferred response for show subcommand", () => {
    const mappedOptions = new Map<string, string | number>();

    vi.spyOn(services.discordService, "extractSubcommand").mockReturnValue({
      name: "show",
      options: [],
      mappedOptions,
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
    expect(result.jobToComplete).toBeDefined();
  });
});
