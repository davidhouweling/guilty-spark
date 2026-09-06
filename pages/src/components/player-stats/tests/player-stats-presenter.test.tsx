import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
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

    expect(window.location.search).toBe("?guildId=guild-2&window=3M&minGamesPlayed=5");
    await vi.waitFor(() => {
      expect(getPlayerStatsSpy).toHaveBeenLastCalledWith({
        gamertag: "Master Chief",
        guildId: "guild-2",
        queueChannelId: undefined,
        window: "3M",
        minGamesPlayed: 5,
      });
    });
  });

  it("presents leaderboard stats and head-to-head tabs from a single response", async () => {
    const service = aFakePlayerStatsServiceWith({
      ranks: {
        [LeaderboardMetric.Kills]: { rank: 1, total: 10 },
        [LeaderboardMetric.SeriesWinRate]: { rank: 2, total: 10 },
      },
      headToHeadSummaries: [
        {
          xboxXuid: "xuid-2",
          discordUserId: null,
          gamertag: "OpponentOne",
          kills: 8,
          killsPerfects: 2,
          deaths: 4,
          deathsPerfects: 1,
          headToHeadGames: 2,
          gamesWith: 4,
          gameWinsWith: 3,
          gamesAgainst: 5,
          gameWinsAgainst: 3,
          opponentGameWins: 2,
          seriesWith: 2,
          seriesWinsWith: 2,
          seriesAgainst: 2,
          seriesWinsAgainst: 1,
          opponentSeriesWins: 1,
        },
      ],
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
    expect(h2hModel.headToHeadRows).toHaveLength(1);
    expect(h2hModel.headToHeadRows[0]).toMatchObject({
      player: "OpponentOne",
      kills: 8,
      killsText: "8 (2 perfects)",
      deaths: 4,
      deathsText: "4 (1 perfect)",
      gamesWithText: "3 - 1 (75.0%)",
      seriesWithText: "2 - 0 (100.0%)",
      gamesAgainstText: "3 - 2 (60.0%)",
      seriesAgainstText: "1 - 1 (50.0%)",
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
        selectedGuildId="guild-1"
        selectedQueueChannelId={null}
        selectedWindow={LeaderboardWindow.ThreeMonths}
        selectedMinGamesPlayed={5}
        minGamesPlayedOptions={[{ value: "5", label: "5" }]}
        selectedTabId="stats"
        statsRows={[
          { stat: "Series wins", rank: "🥇", value: "2", sortRank: 1, sortValue: 2 },
          { stat: "Kills", rank: "#4", value: "100", sortRank: 4, sortValue: 100 },
        ]}
        headToHeadRows={[]}
        statsFooter="Min games: 5 | Total players: 10"
        onGuildChange={vi.fn()}
        onQueueChange={vi.fn()}
        onWindowChange={vi.fn()}
        onMinGamesPlayedChange={vi.fn()}
        onTabChange={vi.fn()}
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
        selectedGuildId="guild-1"
        selectedQueueChannelId={null}
        selectedWindow={LeaderboardWindow.ThreeMonths}
        selectedMinGamesPlayed={5}
        minGamesPlayedOptions={[{ value: "5", label: "5" }]}
        selectedTabId="head-to-head"
        statsRows={[]}
        headToHeadRows={[
          {
            player: "OpponentOne",
            kills: 8,
            killsText: "8 (2 perfects)",
            deaths: 4,
            deathsText: "4 (1 perfect)",
            gamesWithTotal: 4,
            gamesWithText: "3 - 1 (75.0%)",
            gamesWithWinRate: 75.0,
            seriesWithTotal: 2,
            seriesWithText: "2 - 0 (100.0%)",
            seriesWithWinRate: 100.0,
            gamesAgainstTotal: 5,
            gamesAgainstText: "3 - 2 (60.0%)",
            gamesAgainstWinRate: 60.0,
            seriesAgainstTotal: 2,
            seriesAgainstText: "1 - 1 (50.0%)",
            seriesAgainstWinRate: 50.0,
          },
        ]}
        headToHeadFooter="Showing top 50 players by total games played with or against them"
        onGuildChange={vi.fn()}
        onQueueChange={vi.fn()}
        onWindowChange={vi.fn()}
        onMinGamesPlayedChange={vi.fn()}
        onTabChange={onTabChange}
      />,
    );

    expect(screen.getByRole("table", { name: "Player head to head table" })).not.toBeNull();
    expect(screen.getByText("OpponentOne")).not.toBeNull();
    expect(screen.getByText("8 (2 perfects)")).not.toBeNull();
    expect(screen.getByText("3 - 1 (75.0%)")).not.toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Leaderboard stats" }));
    expect(onTabChange).toHaveBeenCalledWith("stats");
  });

  it("renders minimum games options and requests the selected threshold", async () => {
    const service = aFakePlayerStatsServiceWith();
    const getPlayerStatsSpy = vi.spyOn(service, "getPlayerStats");
    const store = new PlayerStatsStore();
    const presenter = new PlayerStatsPresenter({ service, gamertag: "Master Chief", store });

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });

    const model = presenter.present(store.getSnapshot());
    expect(model.minGamesPlayedOptions).toHaveLength(10);
    expect(model.selectedMinGamesPlayed).toBe(5);

    model.onMinGamesPlayedChange("8");

    expect(window.location.search).toContain("minGamesPlayed=8");
    await vi.waitFor(() => {
      expect(getPlayerStatsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ minGamesPlayed: 8 }));
    });
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
        selectedGuildId="guild-1"
        selectedQueueChannelId={null}
        selectedWindow={LeaderboardWindow.ThreeMonths}
        selectedMinGamesPlayed={5}
        minGamesPlayedOptions={[{ value: "5", label: "5" }]}
        selectedTabId="stats"
        statsRows={[
          { stat: "Series wins", rank: "#4", value: "2", sortRank: 4, sortValue: 2 },
          { stat: "Kills", rank: "🥇", value: "100", sortRank: 1, sortValue: 100 },
          { stat: "Accuracy", rank: "Unranked", value: "50%", sortRank: undefined, sortValue: 50 },
        ]}
        headToHeadRows={[]}
        onGuildChange={vi.fn()}
        onQueueChange={vi.fn()}
        onWindowChange={vi.fn()}
        onMinGamesPlayedChange={vi.fn()}
        onTabChange={vi.fn()}
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
        selectedGuildId="guild-1"
        selectedQueueChannelId={null}
        selectedWindow={LeaderboardWindow.ThreeMonths}
        selectedMinGamesPlayed={5}
        minGamesPlayedOptions={[{ value: "5", label: "5" }]}
        selectedTabId="stats"
        statsRows={[
          { stat: "Series wins", rank: "#4", value: "2", sortRank: 4, sortValue: 2 },
          { stat: "Kills", rank: "🥇", value: "100", sortRank: 1, sortValue: 100 },
          { stat: "Accuracy", rank: "Unranked", value: "50%", sortRank: undefined, sortValue: 50 },
        ]}
        headToHeadRows={[]}
        onGuildChange={vi.fn()}
        onQueueChange={vi.fn()}
        onWindowChange={vi.fn()}
        onMinGamesPlayedChange={vi.fn()}
        onTabChange={vi.fn()}
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

  it("sorts head to head table by H2H Kills descending, ascending, and unsorted", () => {
    render(
      <PlayerStats
        state="loaded"
        gamertag="Master Chief"
        scopeLabel="Test Server / All queues / 3M"
        servers={[{ value: "guild-1", label: "Test Server" }]}
        queueOptions={[{ value: "all", label: "All configured queues" }]}
        windowOptions={[{ value: LeaderboardWindow.ThreeMonths, label: "3 months" }]}
        selectedGuildId="guild-1"
        selectedQueueChannelId={null}
        selectedWindow={LeaderboardWindow.ThreeMonths}
        selectedMinGamesPlayed={5}
        minGamesPlayedOptions={[{ value: "5", label: "5" }]}
        selectedTabId="head-to-head"
        statsRows={[]}
        headToHeadRows={[
          {
            player: "PlayerLow",
            kills: 4,
            killsText: "4 (0 perfects)",
            deaths: 6,
            deathsText: "6 (0 perfects)",
            gamesWithTotal: 4,
            gamesWithText: "1 - 3 (25.0%)",
            gamesWithWinRate: 25.0,
            seriesWithTotal: 2,
            seriesWithText: "0 - 2 (0.0%)",
            seriesWithWinRate: 0.0,
            gamesAgainstTotal: 4,
            gamesAgainstText: "2 - 2 (50.0%)",
            gamesAgainstWinRate: 50.0,
            seriesAgainstTotal: 2,
            seriesAgainstText: "1 - 1 (50.0%)",
            seriesAgainstWinRate: 50.0,
          },
          {
            player: "PlayerHigh",
            kills: 12,
            killsText: "12 (3 perfects)",
            deaths: 2,
            deathsText: "2 (0 perfects)",
            gamesWithTotal: 4,
            gamesWithText: "3 - 1 (75.0%)",
            gamesWithWinRate: 75.0,
            seriesWithTotal: 2,
            seriesWithText: "2 - 0 (100.0%)",
            seriesWithWinRate: 100.0,
            gamesAgainstTotal: 4,
            gamesAgainstText: "3 - 1 (75.0%)",
            gamesAgainstWinRate: 75.0,
            seriesAgainstTotal: 2,
            seriesAgainstText: "2 - 0 (100.0%)",
            seriesAgainstWinRate: 100.0,
          },
        ]}
        onGuildChange={vi.fn()}
        onQueueChange={vi.fn()}
        onWindowChange={vi.fn()}
        onMinGamesPlayedChange={vi.fn()}
        onTabChange={vi.fn()}
      />,
    );

    const killsHeader = screen.getByRole("button", { name: "H2H Kills" });

    // Click 1: Descending -> 12 (PlayerHigh), then 4 (PlayerLow)
    fireEvent.click(killsHeader);
    let cells = screen.getAllByRole("cell");
    expect(cells[0]?.textContent).toBe("PlayerHigh");
    expect(cells[7]?.textContent).toBe("PlayerLow");

    // Click 2: Ascending -> 4 (PlayerLow), then 12 (PlayerHigh)
    fireEvent.click(killsHeader);
    cells = screen.getAllByRole("cell");
    expect(cells[0]?.textContent).toBe("PlayerLow");
    expect(cells[7]?.textContent).toBe("PlayerHigh");

    // Click 3: Unsorted -> original order (PlayerLow, PlayerHigh)
    fireEvent.click(killsHeader);
    cells = screen.getAllByRole("cell");
    expect(cells[0]?.textContent).toBe("PlayerLow");
    expect(cells[7]?.textContent).toBe("PlayerHigh");
  });
});
