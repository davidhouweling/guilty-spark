import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../database/database";
import { aFakeDatabaseServiceWith, aFakeLeaderboardPostRow } from "../../database/fakes/database.fake";
import type { DiscordService } from "../../discord/discord";
import { aFakeDiscordServiceWith } from "../../discord/fakes/discord.fake";
import { apiMessage } from "../../discord/fakes/data";
import { DiscordError } from "../../discord/discord-error";
import type { LogService } from "../../log/types";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { LeaderboardPostReaper } from "../leaderboard-post-reaper";

describe("LeaderboardPostReaper", () => {
  let databaseService: DatabaseService;
  let discordService: DiscordService;
  let logService: LogService;
  let reaper: LeaderboardPostReaper;

  beforeEach(() => {
    databaseService = aFakeDatabaseServiceWith();
    discordService = aFakeDiscordServiceWith();
    logService = aFakeLogServiceWith();
    reaper = new LeaderboardPostReaper({ databaseService, discordService, logService });
  });

  it("does not fetch messages when no leaderboard posts exist", async () => {
    vi.spyOn(databaseService, "getAllLeaderboardPosts").mockResolvedValue([]);
    const getMessageSpy = vi.spyOn(discordService, "getMessage");

    await reaper.execute();

    expect(getMessageSpy).not.toHaveBeenCalled();
  });

  it("keeps leaderboard posts whose Discord messages exist", async () => {
    const post = aFakeLeaderboardPostRow();
    vi.spyOn(databaseService, "getAllLeaderboardPosts").mockResolvedValue([post]);
    const getMessageSpy = vi.spyOn(discordService, "getMessage").mockResolvedValue(apiMessage);
    const deletePostSpy = vi.spyOn(databaseService, "deleteLeaderboardPost");

    await reaper.execute();

    expect(getMessageSpy).toHaveBeenCalledWith(post.ChannelId, post.MessageId);
    expect(deletePostSpy).not.toHaveBeenCalled();
  });

  it("deletes posts whose Discord message is confirmed missing", async () => {
    const post = aFakeLeaderboardPostRow();
    vi.spyOn(databaseService, "getAllLeaderboardPosts").mockResolvedValue([post]);
    vi.spyOn(discordService, "getMessage").mockRejectedValue(
      new DiscordError(404, { code: 10008, message: "Unknown Message" }),
    );
    const deletePostSpy = vi.spyOn(databaseService, "deleteLeaderboardPost").mockResolvedValue(undefined);

    await reaper.execute();

    expect(deletePostSpy).toHaveBeenCalledWith(post.ChannelId, post.MessageId);
  });

  it("keeps posts when Discord reports a transient error", async () => {
    const post = aFakeLeaderboardPostRow();
    vi.spyOn(databaseService, "getAllLeaderboardPosts").mockResolvedValue([post]);
    vi.spyOn(discordService, "getMessage").mockRejectedValue(new Error("Discord temporarily unavailable"));
    const deletePostSpy = vi.spyOn(databaseService, "deleteLeaderboardPost");

    await reaper.execute();

    expect(deletePostSpy).not.toHaveBeenCalled();
  });

  it("continues reaping posts when deletion of one missing registration fails", async () => {
    const firstPost = aFakeLeaderboardPostRow();
    const secondPost = aFakeLeaderboardPostRow({ ChannelId: "leaderboard-channel-2", MessageId: "leaderboard-message-2" });
    vi.spyOn(databaseService, "getAllLeaderboardPosts").mockResolvedValue([firstPost, secondPost]);
    vi.spyOn(discordService, "getMessage")
      .mockRejectedValueOnce(new DiscordError(404, { code: 10008, message: "Unknown Message" }))
      .mockRejectedValueOnce(new DiscordError(404, { code: 10003, message: "Unknown Channel" }));
    const deletePostSpy = vi
      .spyOn(databaseService, "deleteLeaderboardPost")
      .mockRejectedValueOnce(new Error("D1 temporarily unavailable"))
      .mockResolvedValueOnce(undefined);

    await reaper.execute();

    expect(deletePostSpy).toHaveBeenCalledTimes(2);
    expect(deletePostSpy).toHaveBeenNthCalledWith(1, firstPost.ChannelId, firstPost.MessageId);
    expect(deletePostSpy).toHaveBeenNthCalledWith(2, secondPost.ChannelId, secondPost.MessageId);
  });
});
