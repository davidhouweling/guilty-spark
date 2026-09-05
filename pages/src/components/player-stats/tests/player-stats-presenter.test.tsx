import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { LeaderboardPlayerRelationshipMetric } from "@guilty-spark/shared/halo/leaderboard-formatting";
import { PlayerStats } from "../player-stats";
import { PlayerStatsPresenter } from "../player-stats-presenter";
import { PlayerStatsStore } from "../player-stats-store";
import { aFakePlayerStatsServiceWith } from "../../../services/player-stats/fakes/player-stats.fake";

describe("PlayerStatsPresenter", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/stats/player/Master%20Chief");
  });

  afterEach(() => {
    cleanup();
  });

  it("selects the requested server and updates browser history without a reload", async () => {
    const service = aFakePlayerStatsServiceWith();
    const getPlayerStatsSpy = vi.spyOn(service, "getPlayerStats");
    const store = new PlayerStatsStore();
    const presenter = new PlayerStatsPresenter({ service, gamertag: "Master Chief", store });

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });

    presenter.present(store.getSnapshot()).onGuildChange("guild-2");

    expect(window.location.search).toBe("?guildId=guild-2&window=3M");
    await vi.waitFor(() => {
      expect(getPlayerStatsSpy).toHaveBeenLastCalledWith({
        gamertag: "Master Chief",
        guildId: "guild-2",
        queueChannelId: undefined,
        window: "3M",
      });
    });
  });

  it("presents leaderboard stats and head-to-head tabs from a single response", async () => {
    const service = aFakePlayerStatsServiceWith({
      ranks: {
        [LeaderboardMetric.Kills]: { rank: 1, total: 10 },
        [LeaderboardMetric.SeriesWinRate]: { rank: 2, total: 10 },
      },
      relationships: {
        [LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills]: [
          {
            XboxXuid: "xuid-2",
            DiscordUserId: null,
            Gamertag: "OpponentOne",
            MetricValue: 8.5,
            SharedCount: 4,
            Wins: 3,
            Perfects: 2,
          },
        ],
      },
    });
    const store = new PlayerStatsStore();
    const presenter = new PlayerStatsPresenter({ service, gamertag: "Master Chief", store });

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });

    const model = presenter.present(store.getSnapshot());
    expect(model.selectedTabId).toBe("stats");
    expect(model.statsRows.find((r) => r.stat === "Kills")).toMatchObject({
      stat: "Kills",
      rank: "🥇",
      value: "100",
    });

    model.onTabChange("head-to-head");
    const h2hModel = presenter.present(store.getSnapshot());
    expect(h2hModel.selectedTabId).toBe("head-to-head");
    expect(h2hModel.relationshipRows).toHaveLength(1);
    expect(h2hModel.relationshipRows[0]).toMatchObject({
      player: "OpponentOne",
      rank: "🥇",
      value: "8.5 kills/game (2 perfects)",
    });
  });

  it("renders player stats in a leaderboard-style table with Stat, Rank, and Value columns", () => {
    render(
      <PlayerStats
        state="loaded"
        gamertag="Master Chief"
        scopeLabel="Test Server / All queues / 3M"
        servers={[{ value: "guild-1", label: "Test Server" }]}
        queueOptions={[
          { value: "all", label: "All configured queues" },
          { value: "queue-1", label: "#arena" },
        ]}
        windowOptions={[
          { value: LeaderboardWindow.OneWeek, label: "1 week" },
          { value: LeaderboardWindow.ThreeMonths, label: "3 months" },
        ]}
        relationshipMetricOptions={[
          { value: LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills, label: "Avg head to head - Killed most" },
        ]}
        selectedGuildId="guild-1"
        selectedQueueChannelId={null}
        selectedWindow={LeaderboardWindow.ThreeMonths}
        selectedTabId="stats"
        selectedRelationshipMetric={LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills}
        statsRows={[
          { stat: "Series wins", rank: "🥇", value: "2", sortRank: 1, sortValue: 2 },
          { stat: "Kills", rank: "#4", value: "100", sortRank: 4, sortValue: 100 },
        ]}
        relationshipRows={[]}
        statsFooter="Min games: 5 | Total players: 10"
        onGuildChange={vi.fn()}
        onQueueChange={vi.fn()}
        onWindowChange={vi.fn()}
        onTabChange={vi.fn()}
        onRelationshipMetricChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("table", { name: "Player stats table" })).not.toBeNull();
    expect(screen.getByText("Stat")).not.toBeNull();
    expect(screen.getByText("Rank")).not.toBeNull();
    expect(screen.getByText("Value")).not.toBeNull();
    expect(screen.getByText("Series wins")).not.toBeNull();
    expect(screen.getByText("🥇")).not.toBeNull();
    expect(screen.getByText("100")).not.toBeNull();
    expect(screen.getByText("Min games: 5 | Total players: 10")).not.toBeNull();
  });

  it("renders head to head tab when selected and responds to tab click", () => {
    const onTabChange = vi.fn();
    render(
      <PlayerStats
        state="loaded"
        gamertag="Master Chief"
        scopeLabel="Test Server / All queues / 3M"
        servers={[{ value: "guild-1", label: "Test Server" }]}
        queueOptions={[
          { value: "all", label: "All configured queues" },
          { value: "queue-1", label: "#arena" },
        ]}
        windowOptions={[{ value: LeaderboardWindow.ThreeMonths, label: "3 months" }]}
        relationshipMetricOptions={[
          { value: LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills, label: "Avg head to head - Killed most" },
        ]}
        selectedGuildId="guild-1"
        selectedQueueChannelId={null}
        selectedWindow={LeaderboardWindow.ThreeMonths}
        selectedTabId="head-to-head"
        selectedRelationshipMetric={LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills}
        statsRows={[]}
        relationshipRows={[
          {
            player: "OpponentOne",
            rank: "🥇",
            value: "8.5 kills/game (2 perfects)",
            sortRank: 1,
            sortValue: 8.5,
            sharedCount: 4,
            wins: 3,
            perfects: 2,
          },
        ]}
        relationshipFooter={undefined}
        onGuildChange={vi.fn()}
        onQueueChange={vi.fn()}
        onWindowChange={vi.fn()}
        onTabChange={onTabChange}
        onRelationshipMetricChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("table", { name: "Player head to head table" })).not.toBeNull();
    expect(screen.getByText("OpponentOne")).not.toBeNull();
    expect(screen.getByText("8.5 kills/game (2 perfects)")).not.toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Leaderboard stats" }));
    expect(onTabChange).toHaveBeenCalledWith("stats");
  });

  it("sorts player stats table by Rank ascending, descending, and unsorted on header clicks", () => {
    render(
      <PlayerStats
        state="loaded"
        gamertag="Master Chief"
        scopeLabel="Test Server / All queues / 3M"
        servers={[{ value: "guild-1", label: "Test Server" }]}
        queueOptions={[{ value: "all", label: "All configured queues" }]}
        windowOptions={[{ value: LeaderboardWindow.ThreeMonths, label: "3 months" }]}
        relationshipMetricOptions={[]}
        selectedGuildId="guild-1"
        selectedQueueChannelId={null}
        selectedWindow={LeaderboardWindow.ThreeMonths}
        selectedTabId="stats"
        selectedRelationshipMetric={LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills}
        statsRows={[
          { stat: "Series wins", rank: "#4", value: "2", sortRank: 4, sortValue: 2 },
          { stat: "Kills", rank: "🥇", value: "100", sortRank: 1, sortValue: 100 },
          { stat: "Accuracy", rank: "Unranked", value: "50%", sortRank: undefined, sortValue: 50 },
        ]}
        relationshipRows={[]}
        onGuildChange={vi.fn()}
        onQueueChange={vi.fn()}
        onWindowChange={vi.fn()}
        onTabChange={vi.fn()}
        onRelationshipMetricChange={vi.fn()}
      />,
    );

    const rankHeader = screen.getByRole("button", { name: "Rank" });

    // Click 1: Ascending -> 🥇 (Rank 1), #4 (Rank 4), Unranked
    fireEvent.click(rankHeader);
    let cells = screen.getAllByRole("cell");
    expect(cells[0]?.textContent).toBe("Kills");
    expect(cells[3]?.textContent).toBe("Series wins");
    expect(cells[6]?.textContent).toBe("Accuracy");

    // Click 2: Descending -> #4 (Rank 4), 🥇 (Rank 1), Unranked (at the end)
    fireEvent.click(rankHeader);
    cells = screen.getAllByRole("cell");
    expect(cells[0]?.textContent).toBe("Series wins");
    expect(cells[3]?.textContent).toBe("Kills");
    expect(cells[6]?.textContent).toBe("Accuracy");

    // Click 3: Unsorted -> original order (Series wins, Kills, Accuracy)
    fireEvent.click(rankHeader);
    cells = screen.getAllByRole("cell");
    expect(cells[0]?.textContent).toBe("Series wins");
    expect(cells[3]?.textContent).toBe("Kills");
    expect(cells[6]?.textContent).toBe("Accuracy");
  });

  it("sorts player stats table by Stat column A-Z, Z-A, and unsorted on header clicks", () => {
    render(
      <PlayerStats
        state="loaded"
        gamertag="Master Chief"
        scopeLabel="Test Server / All queues / 3M"
        servers={[{ value: "guild-1", label: "Test Server" }]}
        queueOptions={[{ value: "all", label: "All configured queues" }]}
        windowOptions={[{ value: LeaderboardWindow.ThreeMonths, label: "3 months" }]}
        relationshipMetricOptions={[]}
        selectedGuildId="guild-1"
        selectedQueueChannelId={null}
        selectedWindow={LeaderboardWindow.ThreeMonths}
        selectedTabId="stats"
        selectedRelationshipMetric={LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills}
        statsRows={[
          { stat: "Series wins", rank: "#4", value: "2", sortRank: 4, sortValue: 2 },
          { stat: "Kills", rank: "🥇", value: "100", sortRank: 1, sortValue: 100 },
          { stat: "Accuracy", rank: "Unranked", value: "50%", sortRank: undefined, sortValue: 50 },
        ]}
        relationshipRows={[]}
        onGuildChange={vi.fn()}
        onQueueChange={vi.fn()}
        onWindowChange={vi.fn()}
        onTabChange={vi.fn()}
        onRelationshipMetricChange={vi.fn()}
      />,
    );

    const statHeader = screen.getByRole("button", { name: "Stat" });

    // Click 1: Ascending (A-Z) -> Accuracy, Kills, Series wins
    fireEvent.click(statHeader);
    let cells = screen.getAllByRole("cell");
    expect(cells[0]?.textContent).toBe("Accuracy");
    expect(cells[3]?.textContent).toBe("Kills");
    expect(cells[6]?.textContent).toBe("Series wins");

    // Click 2: Descending (Z-A) -> Series wins, Kills, Accuracy
    fireEvent.click(statHeader);
    cells = screen.getAllByRole("cell");
    expect(cells[0]?.textContent).toBe("Series wins");
    expect(cells[3]?.textContent).toBe("Kills");
    expect(cells[6]?.textContent).toBe("Accuracy");

    // Click 3: Unsorted -> original order (Series wins, Kills, Accuracy)
    fireEvent.click(statHeader);
    cells = screen.getAllByRole("cell");
    expect(cells[0]?.textContent).toBe("Series wins");
    expect(cells[3]?.textContent).toBe("Kills");
    expect(cells[6]?.textContent).toBe("Accuracy");
  });

  it("sorts head to head table by Value descending, ascending, and unsorted", () => {
    render(
      <PlayerStats
        state="loaded"
        gamertag="Master Chief"
        scopeLabel="Test Server / All queues / 3M"
        servers={[{ value: "guild-1", label: "Test Server" }]}
        queueOptions={[{ value: "all", label: "All configured queues" }]}
        windowOptions={[{ value: LeaderboardWindow.ThreeMonths, label: "3 months" }]}
        relationshipMetricOptions={[
          { value: LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills, label: "Avg head to head - Killed most" },
        ]}
        selectedGuildId="guild-1"
        selectedQueueChannelId={null}
        selectedWindow={LeaderboardWindow.ThreeMonths}
        selectedTabId="head-to-head"
        selectedRelationshipMetric={LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills}
        statsRows={[]}
        relationshipRows={[
          {
            player: "PlayerLow",
            rank: "🥉",
            value: "4.0 kills/game (0 perfects)",
            sortRank: 3,
            sortValue: 4.0,
            sharedCount: 4,
            wins: 1,
            perfects: 0,
          },
          {
            player: "PlayerHigh",
            rank: "🥇",
            value: "12.0 kills/game (3 perfects)",
            sortRank: 1,
            sortValue: 12.0,
            sharedCount: 4,
            wins: 3,
            perfects: 3,
          },
        ]}
        onGuildChange={vi.fn()}
        onQueueChange={vi.fn()}
        onWindowChange={vi.fn()}
        onTabChange={vi.fn()}
        onRelationshipMetricChange={vi.fn()}
      />,
    );

    const valueHeader = screen.getByRole("button", { name: "Value" });

    // Click 1: Descending -> 12.0 (PlayerHigh), then 4.0 (PlayerLow)
    fireEvent.click(valueHeader);
    let cells = screen.getAllByRole("cell");
    expect(cells[1]?.textContent).toBe("PlayerHigh");
    expect(cells[4]?.textContent).toBe("PlayerLow");

    // Click 2: Ascending -> 4.0 (PlayerLow), then 12.0 (PlayerHigh)
    fireEvent.click(valueHeader);
    cells = screen.getAllByRole("cell");
    expect(cells[1]?.textContent).toBe("PlayerLow");
    expect(cells[4]?.textContent).toBe("PlayerHigh");

    // Click 3: Unsorted -> original order (PlayerLow, PlayerHigh)
    fireEvent.click(valueHeader);
    cells = screen.getAllByRole("cell");
    expect(cells[1]?.textContent).toBe("PlayerLow");
    expect(cells[4]?.textContent).toBe("PlayerHigh");
  });
});
