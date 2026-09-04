import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { aFakeLeaderboardServiceWith } from "../../../services/leaderboard/fakes/leaderboard.fake";
import { LeaderboardPresenter } from "../leaderboard-presenter";
import { LeaderboardStore } from "../leaderboard-store";

describe("LeaderboardPresenter", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/leaderboard/guild-1");
  });

  it("loads API defaults and hides reset when no reset marker exists", async () => {
    const store = new LeaderboardStore();
    const service = aFakeLeaderboardServiceWith({
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.Kills,
      resetAt: null,
      rows: [
        {
          rank: 1,
          xboxXuid: "xuid-1",
          discordUserId: null,
          gamertag: "Alpha",
          seriesPlayed: 2,
          seriesWins: 1,
          gamesPlayed: 8,
          gameWins: 4,
          medalCount: 0,
          objectiveGamesPlayed: 0,
          objectiveTimeSeconds: 0,
          metricValue: 42,
        },
      ],
    });
    const presenter = new LeaderboardPresenter({ store, service, guildId: "guild-1", initialQueueChannelId: null });

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });

    const model = presenter.present(store.getSnapshot());
    expect(model.metricLabel).toBe("Kills (total)");
    expect(model.windowLabel).toBe("1M");
    expect(model.windowOptions.map((option) => option.value)).not.toContain(LeaderboardWindow.LastReset);
    expect(model.rows[0]?.value).toBe("42");
  });

  it("parses lowercase query parameters and serializes filter changes in lowercase", async () => {
    window.history.replaceState({}, "", "/leaderboard/guild-1?window=1m&metric=kills");
    const store = new LeaderboardStore();
    const service = aFakeLeaderboardServiceWith({
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.Kills,
      resetAt: 1_723_600_000,
    });
    const presenter = new LeaderboardPresenter({ store, service, guildId: "guild-1", initialQueueChannelId: null });

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });
    presenter.present(store.getSnapshot()).onWindowChange(LeaderboardWindow.SixMonths);

    expect(window.location.pathname).toBe("/leaderboard/guild-1");
    expect(window.location.search).toBe("?window=6m&metric=kills");
  });

  it("changes to a queue route without a full page navigation", async () => {
    const store = new LeaderboardStore();
    const service = aFakeLeaderboardServiceWith();
    const presenter = new LeaderboardPresenter({ store, service, guildId: "guild-1", initialQueueChannelId: null });

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });
    presenter.present(store.getSnapshot()).onQueueChange("queue-1");

    expect(window.location.pathname).toBe("/leaderboard/guild-1/queue-1");
  });

  it("includes the reset option when the API returns a reset marker", async () => {
    const store = new LeaderboardStore();
    const presenter = new LeaderboardPresenter({
      store,
      service: aFakeLeaderboardServiceWith({ resetAt: 1_723_600_000 }),
      guildId: "guild-1",
      initialQueueChannelId: null,
    });

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });

    const model = presenter.present(store.getSnapshot());
    expect(model.windowOptions.map((option) => option.value)).toContain(LeaderboardWindow.LastReset);
  });

  it("groups stat options by aggregation type", async () => {
    const store = new LeaderboardStore();
    const presenter = new LeaderboardPresenter({
      store,
      service: aFakeLeaderboardServiceWith({ metric: LeaderboardMetric.Kills }),
      guildId: "guild-1",
      initialQueueChannelId: null,
    });

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });

    const model = presenter.present(store.getSnapshot());
    expect(model.metricGroups.map((group) => group.label)).toEqual([
      "Avg per series",
      "Avg per game",
      "Total",
      "Avg per objective game",
      "Total objective",
    ]);
    expect(model.metricGroups[2]?.options).toContainEqual({ value: LeaderboardMetric.Kills, label: "Kills" });
  });
});
