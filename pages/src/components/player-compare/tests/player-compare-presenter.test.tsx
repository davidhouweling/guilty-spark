import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { PlayerCompareResponse } from "@guilty-spark/shared/contracts/stats/player";
import {
  aFakePlayerCompareServiceWith,
  createFakePlayerCompareStats,
} from "../../../services/player-compare/fakes/player-compare.fake";
import { PlayerCompare } from "../player-compare";
import { PlayerComparePresenter } from "../player-compare-presenter";
import { PlayerCompareStore } from "../player-compare-store";
import { PlayerCompareHeadToHeadMetric } from "../types";

describe("PlayerComparePresenter", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/stats/compare");
  });

  afterEach(() => {
    cleanup();
  });

  it("renders an empty add-player state without fetching when no gamertags are supplied", () => {
    const service = aFakePlayerCompareServiceWith();
    const getPlayerCompareSpy = vi.spyOn(service, "getPlayerCompare");
    const store = new PlayerCompareStore();
    const presenter = new PlayerComparePresenter({ service, store, gamertags: [] });

    presenter.start();
    const model = presenter.present(store.getSnapshot());

    expect(model.state).toBe("loaded");
    expect(model.title).toBe("Compare players");
    expect(model.scopeLabel).toBe("Add players to compare.");
    expect(model.statsRows).toHaveLength(0);
    expect(getPlayerCompareSpy).not.toHaveBeenCalled();
  });

  it("loads comparison data when a single gamertag is supplied", async () => {
    const service = aFakePlayerCompareServiceWith({
      players: [
        {
          player: { xboxXuid: "xuid-1", gamertag: "Alpha" },
          stats: createFakePlayerCompareStats("Alpha", "xuid-1"),
          ranks: {},
        },
      ],
    });
    const getPlayerCompareSpy = vi.spyOn(service, "getPlayerCompare");
    const store = new PlayerCompareStore();
    const presenter = new PlayerComparePresenter({ service, store, gamertags: ["Alpha"] });

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });
    const model = presenter.present(store.getSnapshot());

    expect(model.title).toBe("Alpha");
    expect(model.selectedGuildId).toBe("guild-1");
    expect(model.selectedWindow).toBe(LeaderboardWindow.ThreeMonths);
    expect(model.statsRows.length).toBeGreaterThan(0);
    expect(model.statsRows[0]?.values).toHaveLength(1);
    expect(getPlayerCompareSpy).toHaveBeenCalledWith({
      gamertags: ["Alpha"],
      guildId: undefined,
      queueChannelId: undefined,
      window: undefined,
      minGamesPlayed: undefined,
    });
  });

  it("loads comparison data when at least two gamertags are supplied", async () => {
    const service = aFakePlayerCompareServiceWith();
    const getPlayerCompareSpy = vi.spyOn(service, "getPlayerCompare");
    const store = new PlayerCompareStore();
    const presenter = new PlayerComparePresenter({ service, store, gamertags: ["Alpha", "Bravo"] });

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });
    const model = presenter.present(store.getSnapshot());

    expect(model.title).toBe("Alpha vs Bravo");
    expect(model.selectedGuildId).toBe("guild-1");
    expect(model.selectedWindow).toBe(LeaderboardWindow.ThreeMonths);
    expect(model.statsRows.length).toBeGreaterThan(0);
    expect(model.statsRows[0]?.values).toHaveLength(2);
    expect(getPlayerCompareSpy).toHaveBeenCalledWith({
      gamertags: ["Alpha", "Bravo"],
      guildId: undefined,
      queueChannelId: undefined,
      window: undefined,
      minGamesPlayed: undefined,
    });
  });

  it("adds a second player from the empty page and updates the URL before loading", async () => {
    const service = aFakePlayerCompareServiceWith();
    const getPlayerCompareSpy = vi.spyOn(service, "getPlayerCompare");
    const store = new PlayerCompareStore();
    const presenter = new PlayerComparePresenter({ service, store, gamertags: ["Alpha"] });

    presenter.start();
    presenter.changeAddPlayerValue("Bravo");
    presenter.addPlayer();

    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });

    expect(window.location.search).toBe("?gamertag=Alpha&gamertag=Bravo");
    expect(getPlayerCompareSpy).toHaveBeenCalledWith(expect.objectContaining({ gamertags: ["Alpha", "Bravo"] }));
  });

  it("uses pending players and filters while a new comparison is loading", async () => {
    const service = aFakePlayerCompareServiceWith({
      servers: [
        { guildId: "guild-1", guildName: "First Server", gamesPlayed: 12, queueOptions: [] },
        { guildId: "guild-2", guildName: "Second Server", gamesPlayed: 10, queueOptions: [] },
      ],
    });
    const store = new PlayerCompareStore();
    const presenter = new PlayerComparePresenter({ service, store, gamertags: ["Alpha", "Bravo"] });

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });
    vi.spyOn(service, "getPlayerCompare").mockImplementation(
      async () => new Promise<PlayerCompareResponse>(() => undefined),
    );
    presenter.changeAddPlayerValue("Charlie");
    presenter.addPlayer();
    presenter.changeGuild("guild-2");

    const model = presenter.present(store.getSnapshot());

    expect(model.state).toBe("loading");
    expect(model.gamertags).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(model.selectedGuildId).toBe("guild-2");
    expect(model.scopeLabel).toBe("Second Server / All queues / 3M");
  });

  it("does not add a duplicate gamertag with different casing", () => {
    const service = aFakePlayerCompareServiceWith();
    const getPlayerCompareSpy = vi.spyOn(service, "getPlayerCompare");
    const store = new PlayerCompareStore();
    const presenter = new PlayerComparePresenter({ service, store, gamertags: ["Alpha", "Bravo"] });

    presenter.start();
    presenter.changeAddPlayerValue("alpha");
    const duplicateModel = presenter.present(store.getSnapshot());
    duplicateModel.onAddPlayer();

    expect(duplicateModel.canAddPlayer).toBe(false);
    expect(window.location.search).toBe("");
    expect(getPlayerCompareSpy).toHaveBeenCalledTimes(1);
  });

  it("removes a player locally and keeps the one-player comparison state with existing filters", async () => {
    const service = aFakePlayerCompareServiceWith({
      players: [
        {
          player: { xboxXuid: "xuid-1", gamertag: "Alpha" },
          stats: createFakePlayerCompareStats("Alpha", "xuid-1"),
          ranks: {},
        },
      ],
    });
    const getPlayerCompareSpy = vi.spyOn(service, "getPlayerCompare");
    const store = new PlayerCompareStore();
    const presenter = new PlayerComparePresenter({ service, store, gamertags: ["Alpha", "Bravo"] });

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });

    presenter.removePlayer("Bravo");
    expect(store.getSnapshot().status).toBe("loaded");
    expect(store.getSnapshot().gamertags).toEqual(["Alpha"]);
    expect(getPlayerCompareSpy).toHaveBeenCalledTimes(1);

    const model = presenter.present(store.getSnapshot());

    expect(window.location.search).toBe("?gamertag=Alpha&guildId=guild-1&window=3M&minGamesPlayed=5");
    expect(model.gamertags).toEqual(["Alpha"]);
    expect(model.title).toBe("Alpha");
    expect(model.statsRows.length).toBeGreaterThan(0);
  });

  it("clears retained filters after removing all players", async () => {
    const service = aFakePlayerCompareServiceWith();
    const getPlayerCompareSpy = vi.spyOn(service, "getPlayerCompare");
    const store = new PlayerCompareStore();
    const presenter = new PlayerComparePresenter({ service, store, gamertags: ["Alpha", "Bravo"] });

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });

    presenter.removePlayer("Alpha");
    presenter.removePlayer("Bravo");
    presenter.changeAddPlayerValue("Charlie");
    presenter.addPlayer();

    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });

    expect(window.location.search).toBe("?gamertag=Charlie");
    expect(getPlayerCompareSpy).toHaveBeenLastCalledWith({
      gamertags: ["Charlie"],
      guildId: undefined,
      queueChannelId: undefined,
      window: undefined,
      minGamesPlayed: undefined,
    });
  });

  it("highlights higher kills and lower deaths as the best aggregate values", async () => {
    const service = aFakePlayerCompareServiceWith({
      players: [
        {
          player: { xboxXuid: "xuid-1", gamertag: "Alpha" },
          stats: { ...createFakePlayerCompareStats("Alpha", "xuid-1"), Kills: 20, Deaths: 8 },
          ranks: {},
        },
        {
          player: { xboxXuid: "xuid-2", gamertag: "Bravo" },
          stats: { ...createFakePlayerCompareStats("Bravo", "xuid-2"), Kills: 15, Deaths: 4 },
          ranks: {},
        },
      ],
    });
    const store = new PlayerCompareStore();
    const presenter = new PlayerComparePresenter({ service, store, gamertags: ["Alpha", "Bravo"] });

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });
    const model = presenter.present(store.getSnapshot());
    const killsRow = model.statsRows.find((row) => row.stat === "Kills");
    const deathsRow = model.statsRows.find((row) => row.stat === "Deaths");

    expect(killsRow?.values.map((value) => value.comparison)).toEqual(["best", "worst"]);
    expect(deathsRow?.values.map((value) => value.comparison)).toEqual(["worst", "best"]);
  });

  it("builds a metric-selected head-to-head matrix", async () => {
    const service = aFakePlayerCompareServiceWith();
    const store = new PlayerCompareStore();
    const presenter = new PlayerComparePresenter({ service, store, gamertags: ["Alpha", "Bravo"] });

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });
    presenter.changeHeadToHeadMetric(PlayerCompareHeadToHeadMetric.KillsAgainst);
    const model = presenter.present(store.getSnapshot());

    expect(model.selectedHeadToHeadMetric).toBe(PlayerCompareHeadToHeadMetric.KillsAgainst);
    expect(model.headToHeadMetricOptions.map((option) => option.label)).toEqual([
      "Series win % vs",
      "Games win % vs",
      "Kills vs",
      "Avg kills/game vs",
    ]);
    expect(model.headToHeadRows).toEqual([
      {
        playerGamertag: "Alpha",
        values: [
          { opponentGamertag: "Alpha", text: "-", sortValue: undefined },
          { opponentGamertag: "Bravo", text: "20 (2 perfects)", sortValue: 20 },
        ],
      },
      {
        playerGamertag: "Bravo",
        values: [
          { opponentGamertag: "Alpha", text: "15 (1 perfect)", sortValue: 15 },
          { opponentGamertag: "Bravo", text: "-", sortValue: undefined },
        ],
      },
    ]);
  });

  it("shows no average-kills value when players have no head-to-head games", async () => {
    const defaultService = aFakePlayerCompareServiceWith();
    const defaultResponse = await defaultService.getPlayerCompare({ gamertags: ["Alpha", "Bravo"] });
    const service = aFakePlayerCompareServiceWith({
      pairSummaries: defaultResponse.pairSummaries.map((summary) => ({
        ...summary,
        headToHeadGamesPlayed: 0,
      })),
    });
    const store = new PlayerCompareStore();
    const presenter = new PlayerComparePresenter({ service, store, gamertags: ["Alpha", "Bravo"] });

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().status).toBe("loaded");
    });
    presenter.changeHeadToHeadMetric(PlayerCompareHeadToHeadMetric.AvgKillsAgainst);

    expect(presenter.present(store.getSnapshot()).headToHeadRows).toEqual([
      {
        playerGamertag: "Alpha",
        values: [
          { opponentGamertag: "Alpha", text: "-", sortValue: undefined },
          { opponentGamertag: "Bravo", text: "-", sortValue: undefined },
        ],
      },
      {
        playerGamertag: "Bravo",
        values: [
          { opponentGamertag: "Alpha", text: "-", sortValue: undefined },
          { opponentGamertag: "Bravo", text: "-", sortValue: undefined },
        ],
      },
    ]);
  });

  it("renders the head-to-head matrix tab and metric selector for more than two players", () => {
    const onHeadToHeadMetricChange = vi.fn();

    render(
      <PlayerCompare
        state="loaded"
        gamertags={["Alpha", "Bravo", "Charlie"]}
        title="Alpha vs Bravo vs Charlie"
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
        headToHeadMetricOptions={[
          { value: PlayerCompareHeadToHeadMetric.SeriesWinRateAgainst, label: "Series win % vs" },
          { value: PlayerCompareHeadToHeadMetric.KillsAgainst, label: "Kills vs" },
        ]}
        selectedHeadToHeadMetric={PlayerCompareHeadToHeadMetric.KillsAgainst}
        headToHeadRows={[
          {
            playerGamertag: "Alpha",
            values: [
              { opponentGamertag: "Alpha", text: "-", sortValue: undefined },
              { opponentGamertag: "Bravo", text: "20 (2 perfects)", sortValue: 20 },
              { opponentGamertag: "Charlie", text: "10 (1 perfect)", sortValue: 10 },
            ],
          },
          {
            playerGamertag: "Bravo",
            values: [
              { opponentGamertag: "Alpha", text: "15 (1 perfect)", sortValue: 15 },
              { opponentGamertag: "Bravo", text: "-", sortValue: undefined },
              { opponentGamertag: "Charlie", text: "12 (1 perfect)", sortValue: 12 },
            ],
          },
        ]}
        addPlayerValue=""
        canAddPlayer={false}
        statusText="3 PLAYERS"
        onAddPlayerValueChange={vi.fn()}
        onAddPlayer={vi.fn()}
        onRemovePlayer={vi.fn()}
        onGuildChange={vi.fn()}
        onQueueChange={vi.fn()}
        onWindowChange={vi.fn()}
        onMinGamesPlayedChange={vi.fn()}
        onHeadToHeadMetricChange={onHeadToHeadMetricChange}
        onTabChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("table", { name: "Player head-to-head comparison matrix" })).not.toBeNull();
    expect(screen.getByText("20 (2 perfects)")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Metric"), {
      target: { value: PlayerCompareHeadToHeadMetric.SeriesWinRateAgainst },
    });
    expect(onHeadToHeadMetricChange).toHaveBeenCalledWith(PlayerCompareHeadToHeadMetric.SeriesWinRateAgainst);
  });

  it("renders all head-to-head stats in a leaderboard-style table when exactly two players are selected", () => {
    render(
      <PlayerCompare
        state="loaded"
        gamertags={["Alpha", "Bravo"]}
        title="Alpha vs Bravo"
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
        headToHeadMetricOptions={[
          { value: PlayerCompareHeadToHeadMetric.SeriesWinRateAgainst, label: "Series win % vs" },
          { value: PlayerCompareHeadToHeadMetric.KillsAgainst, label: "Kills vs" },
        ]}
        selectedHeadToHeadMetric={PlayerCompareHeadToHeadMetric.KillsAgainst}
        headToHeadRows={[]}
        headToHeadSummaryRows={[
          {
            stat: "Series win %",
            values: [
              { gamertag: "Alpha", text: "50% (1/2)" },
              { gamertag: "Bravo", text: "50% (1/2)" },
            ],
          },
          {
            stat: "Kills",
            values: [
              { gamertag: "Alpha", text: "20" },
              { gamertag: "Bravo", text: "15" },
            ],
          },
        ]}
        addPlayerValue=""
        canAddPlayer={false}
        statusText="2 PLAYERS"
        onAddPlayerValueChange={vi.fn()}
        onAddPlayer={vi.fn()}
        onRemovePlayer={vi.fn()}
        onGuildChange={vi.fn()}
        onQueueChange={vi.fn()}
        onWindowChange={vi.fn()}
        onMinGamesPlayedChange={vi.fn()}
        onHeadToHeadMetricChange={vi.fn()}
        onTabChange={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Metric")).toBeNull();
    expect(screen.getByRole("table", { name: "Player comparison table" })).not.toBeNull();
    expect(screen.getByText("Series win %")).not.toBeNull();
    expect(screen.getByText("Kills")).not.toBeNull();
  });

  it("renders a remove control in the leaderboard column header and submits add-player input", () => {
    const onAddPlayer = vi.fn();
    const onRemovePlayer = vi.fn();

    render(
      <PlayerCompare
        state="loaded"
        gamertags={["Alpha", "Bravo"]}
        title="Alpha vs Bravo"
        scopeLabel="Test Server / All queues / 3M"
        servers={[]}
        queueOptions={[]}
        windowOptions={[{ value: LeaderboardWindow.ThreeMonths, label: "3 months" }]}
        selectedGuildId=""
        selectedQueueChannelId={null}
        selectedWindow={LeaderboardWindow.ThreeMonths}
        selectedMinGamesPlayed={5}
        minGamesPlayedOptions={[{ value: "5", label: "5" }]}
        selectedTabId="stats"
        statsRows={[
          {
            stat: "Kills",
            values: [
              { gamertag: "Alpha", text: "20", sortValue: 20 },
              { gamertag: "Bravo", text: "15", sortValue: 15 },
            ],
          },
        ]}
        headToHeadMetricOptions={[]}
        selectedHeadToHeadMetric={PlayerCompareHeadToHeadMetric.KillsAgainst}
        headToHeadRows={[]}
        addPlayerValue="Charlie"
        canAddPlayer={true}
        statusText="2 PLAYERS"
        onAddPlayerValueChange={vi.fn()}
        onAddPlayer={onAddPlayer}
        onRemovePlayer={onRemovePlayer}
        onGuildChange={vi.fn()}
        onQueueChange={vi.fn()}
        onWindowChange={vi.fn()}
        onMinGamesPlayedChange={vi.fn()}
        onHeadToHeadMetricChange={vi.fn()}
        onTabChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove Bravo" }));
    expect(onRemovePlayer).toHaveBeenCalledWith("Bravo");

    fireEvent.click(screen.getByRole("button", { name: "Add player" }));
    expect(onAddPlayer).toHaveBeenCalled();
  });
});
