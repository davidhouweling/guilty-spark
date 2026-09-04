import { describe, expect, it, vi } from "vitest";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { LeaderboardStore } from "../leaderboard-store";

describe("LeaderboardStore", () => {
  it("publishes loaded leaderboard data and queue labels", () => {
    const store = new LeaderboardStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setLoaded(
      {
        guildId: "guild-1",
        queueChannelId: null,
        window: LeaderboardWindow.ThreeMonths,
        resetAt: null,
        metric: LeaderboardMetric.Kills,
        minGamesPlayed: 5,
        page: 1,
        pageSize: 500,
        total: 0,
        hasLeaderboardData: true,
        rows: [],
      },
      { guildName: "Guild 1", options: [{ channelId: "queue-1", label: "#arena" }] },
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().queueOptions).toEqual([{ channelId: "queue-1", label: "#arena" }]);
    expect(store.getSnapshot().guildName).toBe("Guild 1");
    expect(store.getSnapshot().status).toBe("loaded");
  });
});
