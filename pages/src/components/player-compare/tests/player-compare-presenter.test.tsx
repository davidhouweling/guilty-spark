import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import {
  aFakePlayerCompareServiceWith,
  createFakePlayerCompareStats,
} from "../../../services/player-compare/fakes/player-compare.fake";
import { PlayerComparePresenter } from "../player-compare-presenter";
import { PlayerCompareStore } from "../player-compare-store";

describe("PlayerComparePresenter", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/stats/compare");
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
    expect(model.scopeLabel).toBe("Add at least two players to compare.");
    expect(model.statsRows).toHaveLength(0);
    expect(getPlayerCompareSpy).not.toHaveBeenCalled();
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
    expect(getPlayerCompareSpy).toHaveBeenCalledWith(
      expect.objectContaining({ gamertags: ["Alpha", "Bravo"] }),
    );
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
});
