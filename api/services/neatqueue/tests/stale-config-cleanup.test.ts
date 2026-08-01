import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { APIChannel } from "discord-api-types/v10";
import type { DatabaseService } from "../../database/database";
import { aFakeDatabaseServiceWith, aFakeNeatQueueConfigRow } from "../../database/fakes/database.fake";
import type { DiscordService } from "../../discord/discord";
import { aFakeDiscordServiceWith } from "../../discord/fakes/discord.fake";
import { guild } from "../../discord/fakes/data";
import { DiscordError } from "../../discord/discord-error";
import type { LogService } from "../../log/types";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { StaleNeatQueueConfigCleanup } from "../stale-config-cleanup";

function aChannel(id: string): APIChannel {
  return {
    id,
    name: "queue-channel",
    type: 0,
    position: 0,
  };
}

describe("StaleNeatQueueConfigCleanup", () => {
  let databaseService: DatabaseService;
  let discordService: DiscordService;
  let logService: LogService;
  let cleanup: StaleNeatQueueConfigCleanup;
  let getAllConfigsSpy: MockInstance<typeof databaseService.getAllNeatQueueConfigs>;
  let deleteConfigSpy: MockInstance<typeof databaseService.deleteNeatQueueConfig>;
  let getChannelSpy: MockInstance<typeof discordService.getChannel>;
  let getGuildSpy: MockInstance<typeof discordService.getGuild>;

  beforeEach(() => {
    databaseService = aFakeDatabaseServiceWith();
    discordService = aFakeDiscordServiceWith();
    logService = aFakeLogServiceWith();
    cleanup = new StaleNeatQueueConfigCleanup({ databaseService, discordService, logService });

    getAllConfigsSpy = vi.spyOn(databaseService, "getAllNeatQueueConfigs").mockResolvedValue([]);
    deleteConfigSpy = vi.spyOn(databaseService, "deleteNeatQueueConfig").mockResolvedValue();
    getChannelSpy = vi.spyOn(discordService, "getChannel").mockResolvedValue(aChannel("channel-1"));
    getGuildSpy = vi.spyOn(discordService, "getGuild").mockResolvedValue(guild);
  });

  it("makes no discord calls when no configs exist", async () => {
    await cleanup.execute();

    expect(getChannelSpy).not.toHaveBeenCalled();
    expect(deleteConfigSpy).not.toHaveBeenCalled();
  });

  it("keeps configs whose queue channel exists", async () => {
    getAllConfigsSpy.mockResolvedValue([aFakeNeatQueueConfigRow({ GuildId: "guild-1", ChannelId: "channel-1" })]);

    await cleanup.execute();

    expect(getChannelSpy).toHaveBeenCalledWith("channel-1");
    expect(deleteConfigSpy).not.toHaveBeenCalled();
  });

  it("deletes configs whose queue channel returns 404", async () => {
    getAllConfigsSpy.mockResolvedValue([aFakeNeatQueueConfigRow({ GuildId: "guild-1", ChannelId: "channel-gone" })]);
    getChannelSpy.mockRejectedValue(new DiscordError(404, { code: 10003, message: "Unknown Channel" }));

    await cleanup.execute();

    expect(deleteConfigSpy).toHaveBeenCalledTimes(1);
    expect(deleteConfigSpy).toHaveBeenCalledWith("guild-1", "channel-gone");
    expect(getGuildSpy).not.toHaveBeenCalled();
  });

  it("deletes configs when the channel is inaccessible and the bot is no longer in the guild", async () => {
    getAllConfigsSpy.mockResolvedValue([aFakeNeatQueueConfigRow({ GuildId: "guild-kicked", ChannelId: "channel-1" })]);
    getChannelSpy.mockRejectedValue(new DiscordError(403, { code: 50001, message: "Missing Access" }));
    getGuildSpy.mockRejectedValue(new DiscordError(403, { code: 50001, message: "Missing Access" }));

    await cleanup.execute();

    expect(getGuildSpy).toHaveBeenCalledWith("guild-kicked");
    expect(deleteConfigSpy).toHaveBeenCalledTimes(1);
    expect(deleteConfigSpy).toHaveBeenCalledWith("guild-kicked", "channel-1");
  });

  it("keeps configs when the channel is inaccessible but the bot is still in the guild", async () => {
    getAllConfigsSpy.mockResolvedValue([aFakeNeatQueueConfigRow({ GuildId: "guild-1", ChannelId: "channel-hidden" })]);
    getChannelSpy.mockRejectedValue(new DiscordError(403, { code: 50001, message: "Missing Access" }));

    await cleanup.execute();

    expect(getGuildSpy).toHaveBeenCalledWith("guild-1");
    expect(deleteConfigSpy).not.toHaveBeenCalled();
  });

  it("keeps configs when fetching the queue channel fails with an unexpected error", async () => {
    getAllConfigsSpy.mockResolvedValue([aFakeNeatQueueConfigRow({ GuildId: "guild-1", ChannelId: "channel-1" })]);
    getChannelSpy.mockRejectedValue(new DiscordError(500, { code: 0, message: "Internal Server Error" }));

    await cleanup.execute();

    expect(deleteConfigSpy).not.toHaveBeenCalled();
  });

  it("keeps configs when the guild check fails with an unexpected error", async () => {
    getAllConfigsSpy.mockResolvedValue([aFakeNeatQueueConfigRow({ GuildId: "guild-1", ChannelId: "channel-1" })]);
    getChannelSpy.mockRejectedValue(new DiscordError(403, { code: 50001, message: "Missing Access" }));
    getGuildSpy.mockRejectedValue(new DiscordError(500, { code: 0, message: "Internal Server Error" }));

    await cleanup.execute();

    expect(deleteConfigSpy).not.toHaveBeenCalled();
  });

  it("checks guild access once per guild across multiple inaccessible configs", async () => {
    getAllConfigsSpy.mockResolvedValue([
      aFakeNeatQueueConfigRow({ GuildId: "guild-kicked", ChannelId: "channel-1" }),
      aFakeNeatQueueConfigRow({ GuildId: "guild-kicked", ChannelId: "channel-2" }),
    ]);
    getChannelSpy.mockRejectedValue(new DiscordError(403, { code: 50001, message: "Missing Access" }));
    getGuildSpy.mockRejectedValue(new DiscordError(404, { code: 10004, message: "Unknown Guild" }));

    await cleanup.execute();

    expect(getGuildSpy).toHaveBeenCalledTimes(1);
    expect(getGuildSpy).toHaveBeenCalledWith("guild-kicked");
    expect(deleteConfigSpy).toHaveBeenCalledTimes(2);
    expect(deleteConfigSpy).toHaveBeenCalledWith("guild-kicked", "channel-1");
    expect(deleteConfigSpy).toHaveBeenCalledWith("guild-kicked", "channel-2");
  });

  it("processes remaining configs independently when one is stale", async () => {
    getAllConfigsSpy.mockResolvedValue([
      aFakeNeatQueueConfigRow({ GuildId: "guild-1", ChannelId: "channel-gone" }),
      aFakeNeatQueueConfigRow({ GuildId: "guild-2", ChannelId: "channel-alive" }),
    ]);
    getChannelSpy.mockImplementation(async (channelId: string) => {
      if (channelId === "channel-gone") {
        return Promise.reject(new DiscordError(404, { code: 10003, message: "Unknown Channel" }));
      }
      return Promise.resolve(aChannel(channelId));
    });

    await cleanup.execute();

    expect(deleteConfigSpy).toHaveBeenCalledTimes(1);
    expect(deleteConfigSpy).toHaveBeenCalledWith("guild-1", "channel-gone");
  });
});
