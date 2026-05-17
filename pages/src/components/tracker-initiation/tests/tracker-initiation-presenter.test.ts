import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MockInstance } from "vitest";
import { TrackerInitiationPresenter } from "../tracker-initiation-presenter";
import { TrackerInitiationStore } from "../tracker-initiation-store";
import type { MatchHistoryResponse } from "../types";

function createMockResponse(data: unknown, options: { ok?: boolean; status?: number } = {}): Response {
  const ok = options.ok ?? true;
  const status = options.status ?? (ok ? 200 : 500);

  const response = new Response(JSON.stringify(data), { status, statusText: ok ? "OK" : "Error" });
  return response;
}

describe("TrackerInitiationPresenter", () => {
  let presenter: TrackerInitiationPresenter;
  let store: TrackerInitiationStore;
  let fetchSpy: MockInstance<typeof globalThis.fetch>;
  const mockApiHost = "http://localhost:8787";

  const mockMatchHistory: MatchHistoryResponse = {
    gamertag: "TestPlayer",
    xuid: "xuid(1234567890)",
    matches: [
      {
        matchId: "match1",
        startTime: "2026-03-16T00:00:00.000Z",
        endTime: "2026-03-16T00:10:00.000Z",
        duration: "10m 0s",
        mapName: "Test Map 1",
        modeName: "Slayer",
        outcome: "Win",
        resultString: "Win - 50:49",
        isMatchmaking: true,
        teams: [
          ["player1", "player2"],
          ["player3", "player4"],
        ],
        mapThumbnailUrl: "https://example.com/map1.jpg",
      },
      {
        matchId: "match2",
        startTime: "2026-03-16T00:15:00.000Z",
        endTime: "2026-03-16T00:25:00.000Z",
        duration: "10m 0s",
        mapName: "Test Map 2",
        modeName: "CTF",
        outcome: "Loss",
        resultString: "Loss - 1:3",
        isMatchmaking: false,
        teams: [
          ["player1", "player2"],
          ["player3", "player4"],
        ],
        mapThumbnailUrl: "https://example.com/map2.jpg",
      },
      {
        matchId: "match3",
        startTime: "2026-03-16T00:30:00.000Z",
        endTime: "2026-03-16T00:40:00.000Z",
        duration: "10m 0s",
        mapName: "Test Map 3",
        modeName: "Oddball",
        outcome: "Win",
        resultString: "Win - 100:75",
        isMatchmaking: false,
        teams: [
          ["player1", "player2"],
          ["player3", "player4"],
        ],
        mapThumbnailUrl: "https://example.com/map3.jpg",
      },
    ],
    suggestedGroupings: [["match2", "match3"]],
  };

  beforeEach(() => {
    store = new TrackerInitiationStore("");
    presenter = new TrackerInitiationPresenter({ apiHost: mockApiHost, store });
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  describe("present", () => {
    it("derives canStartTracker as false when state is idle", () => {
      const snapshot = store.getSnapshot();
      const viewModel = TrackerInitiationPresenter.present(snapshot);

      expect(viewModel.canStartTracker).toBe(false);
    });

    it("derives canStartTracker as true when loaded with selections", () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "loaded", data: mockMatchHistory },
        selectedMatchIds: new Set(["match1"]),
        groupings: [],
      });

      const viewModel = TrackerInitiationPresenter.present(store.getSnapshot());

      expect(viewModel.canStartTracker).toBe(true);
    });

    it("derives canStartTracker as false when loaded without selections", () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "loaded", data: mockMatchHistory },
        selectedMatchIds: new Set(),
        groupings: [],
      });

      const viewModel = TrackerInitiationPresenter.present(store.getSnapshot());

      expect(viewModel.canStartTracker).toBe(false);
    });

    it("calculates selectedCount correctly", () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "loaded", data: mockMatchHistory },
        selectedMatchIds: new Set(["match1", "match2"]),
        groupings: [],
      });

      const viewModel = TrackerInitiationPresenter.present(store.getSnapshot());

      expect(viewModel.selectedCount).toBe(2);
    });
  });

  describe("updateGamertag", () => {
    it("updates gamertag in store", () => {
      presenter.updateGamertag("NewPlayer");

      const snapshot = store.getSnapshot();
      expect(snapshot.gamertag).toBe("NewPlayer");
    });

    it("preserves other state when updating gamertag", () => {
      store.setSnapshot({
        gamertag: "OldPlayer",
        state: { type: "error", message: "Test error" },
        selectedMatchIds: new Set(["match1"]),
        groupings: [["match1", "match2"]],
      });

      presenter.updateGamertag("NewPlayer");

      const snapshot = store.getSnapshot();
      expect(snapshot.gamertag).toBe("NewPlayer");
      expect(snapshot.state).toEqual({ type: "error", message: "Test error" });
      expect(snapshot.selectedMatchIds).toEqual(new Set(["match1"]));
    });
  });

  describe("search", () => {
    it("sets error state when gamertag is empty", async () => {
      store.setSnapshot({
        gamertag: "",
        state: { type: "idle" },
        selectedMatchIds: new Set(),
        groupings: [],
      });

      await presenter.search();

      const snapshot = store.getSnapshot();
      expect(snapshot.state).toEqual({ type: "error", message: "Please enter a gamertag" });
    });

    it("trims whitespace from gamertag", async () => {
      store.setSnapshot({
        gamertag: "  TestPlayer  ",
        state: { type: "idle" },
        selectedMatchIds: new Set(),
        groupings: [],
      });

      fetchSpy.mockResolvedValue(createMockResponse(mockMatchHistory));

      await presenter.search();

      expect(fetchSpy).toHaveBeenCalledWith(`${mockApiHost}/api/tracker/individual/TestPlayer/matches`);
    });

    it("sets loading state before fetching", async () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "idle" },
        selectedMatchIds: new Set(),
        groupings: [],
      });

      let loadingStateSeen = false;
      const unsubscribe = store.subscribe(() => {
        const snapshot = store.getSnapshot();
        if (snapshot.state.type === "loading") {
          loadingStateSeen = true;
        }
      });

      fetchSpy.mockResolvedValue(createMockResponse(mockMatchHistory));

      await presenter.search();

      unsubscribe();
      expect(loadingStateSeen).toBe(true);
    });

    it("sets loaded state with data on successful fetch", async () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "idle" },
        selectedMatchIds: new Set(),
        groupings: [],
      });

      fetchSpy.mockResolvedValue(createMockResponse(mockMatchHistory));

      await presenter.search();

      const snapshot = store.getSnapshot();
      expect(snapshot.state).toEqual({ type: "loaded", data: mockMatchHistory });
      expect(snapshot.groupings).toEqual([["match2", "match3"]]);
      expect(snapshot.selectedMatchIds.size).toBe(0);
    });

    it("sets error state when gamertag not found", async () => {
      store.setSnapshot({
        gamertag: "NonExistentPlayer",
        state: { type: "idle" },
        selectedMatchIds: new Set(),
        groupings: [],
      });

      fetchSpy.mockResolvedValue(createMockResponse(null, { ok: false, status: 404 }));

      await presenter.search();

      const snapshot = store.getSnapshot();
      expect(snapshot.state).toEqual({ type: "error", message: "Gamertag not found" });
    });

    it("sets error state on other fetch failures", async () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "idle" },
        selectedMatchIds: new Set(),
        groupings: [],
      });

      fetchSpy.mockResolvedValue(createMockResponse(null, { ok: false, status: 500 }));

      await presenter.search();

      const snapshot = store.getSnapshot();
      expect(snapshot.state).toEqual({ type: "error", message: "Failed to fetch match history" });
    });

    it("sets error state on network error", async () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "idle" },
        selectedMatchIds: new Set(),
        groupings: [],
      });

      fetchSpy.mockRejectedValue(new Error("Network error"));

      await presenter.search();

      const snapshot = store.getSnapshot();
      expect(snapshot.state).toEqual({ type: "error", message: "Network error. Please try again." });
    });
  });

  describe("toggleMatch", () => {
    it("adds match to selection when not selected", () => {
      presenter.toggleMatch("match1");

      const snapshot = store.getSnapshot();
      expect(snapshot.selectedMatchIds.has("match1")).toBe(true);
    });

    it("removes match from selection when already selected", () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "idle" },
        selectedMatchIds: new Set(["match1"]),
        groupings: [],
      });

      presenter.toggleMatch("match1");

      const snapshot = store.getSnapshot();
      expect(snapshot.selectedMatchIds.has("match1")).toBe(false);
    });
  });

  describe("selectAll", () => {
    it("selects all matches when loaded", () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "loaded", data: mockMatchHistory },
        selectedMatchIds: new Set(),
        groupings: [],
      });

      presenter.selectAll();

      const snapshot = store.getSnapshot();
      expect(snapshot.selectedMatchIds.size).toBe(3);
      expect(snapshot.selectedMatchIds.has("match1")).toBe(true);
      expect(snapshot.selectedMatchIds.has("match2")).toBe(true);
      expect(snapshot.selectedMatchIds.has("match3")).toBe(true);
    });

    it("does nothing when not loaded", () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "idle" },
        selectedMatchIds: new Set(),
        groupings: [],
      });

      presenter.selectAll();

      const snapshot = store.getSnapshot();
      expect(snapshot.selectedMatchIds.size).toBe(0);
    });
  });

  describe("deselectAll", () => {
    it("clears all selections", () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "loaded", data: mockMatchHistory },
        selectedMatchIds: new Set(["match1", "match2"]),
        groupings: [],
      });

      presenter.deselectAll();

      const snapshot = store.getSnapshot();
      expect(snapshot.selectedMatchIds.size).toBe(0);
    });
  });

  describe("startTracker", () => {
    beforeEach(() => {
      // Mock window.location.href using Object.defineProperty
      Object.defineProperty(window, "location", {
        value: { href: "" },
        writable: true,
      });
    });

    it("does nothing when not loaded", async () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "idle" },
        selectedMatchIds: new Set(["match1"]),
        groupings: [],
      });

      await presenter.startTracker();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("sends POST request with selected matches and groupings", async () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "loaded", data: mockMatchHistory },
        selectedMatchIds: new Set(["match1", "match2"]),
        groupings: [["match1", "match2"], ["match3"]],
      });

      fetchSpy.mockResolvedValue(
        createMockResponse({ success: true, websocketUrl: "/ws/tracker/individual/TestPlayer" }),
      );

      await presenter.startTracker();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${mockApiHost}/api/tracker/individual/start`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gamertag: "TestPlayer",
            selectedMatchIds: ["match1", "match2"],
            groupings: [["match1", "match2"]],
          }),
        }),
      );
    });

    it("filters groupings to only include selected matches", async () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "loaded", data: mockMatchHistory },
        selectedMatchIds: new Set(["match1"]),
        groupings: [["match1", "match2"], ["match3"]],
      });

      fetchSpy.mockResolvedValue(
        createMockResponse({ success: true, websocketUrl: "/ws/tracker/individual/TestPlayer" }),
      );

      await presenter.startTracker();

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string) as { groupings: string[][] };
      expect(body.groupings).toEqual([["match1"]]);
    });

    it("navigates to tracker page on success", async () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "loaded", data: mockMatchHistory },
        selectedMatchIds: new Set(["match1"]),
        groupings: [],
      });

      fetchSpy.mockResolvedValue(
        createMockResponse({ success: true, websocketUrl: "/ws/tracker/individual/TestPlayer" }),
      );

      await presenter.startTracker();

      expect(window.location.href).toBe("/tracker?gamertag=TestPlayer");
    });

    it("sets error state on API failure", async () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "loaded", data: mockMatchHistory },
        selectedMatchIds: new Set(["match1"]),
        groupings: [],
      });

      fetchSpy.mockResolvedValue(createMockResponse(null, { ok: false, status: 500 }));

      await presenter.startTracker();

      const snapshot = store.getSnapshot();
      expect(snapshot.state).toEqual({ type: "error", message: "Failed to start tracker" });
    });

    it("sets error state on network error", async () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "loaded", data: mockMatchHistory },
        selectedMatchIds: new Set(["match1"]),
        groupings: [],
      });

      fetchSpy.mockRejectedValue(new Error("Network error"));

      await presenter.startTracker();

      const snapshot = store.getSnapshot();
      expect(snapshot.state).toEqual({ type: "error", message: "Network error. Please try again." });
    });
  });

  describe("addToAboveGroup", () => {
    beforeEach(() => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "loaded", data: mockMatchHistory },
        selectedMatchIds: new Set(),
        groupings: [["match2", "match3"]],
      });
    });

    it("does nothing for first match", () => {
      presenter.addToAboveGroup("match1");

      const snapshot = store.getSnapshot();
      expect(snapshot.groupings).toEqual([["match2", "match3"]]);
    });

    it("adds match to existing above group", () => {
      presenter.addToAboveGroup("match3");

      const snapshot = store.getSnapshot();
      expect(snapshot.groupings).toEqual([["match2", "match3"]]);
    });

    it("creates new group with above match when above is not grouped", () => {
      presenter.addToAboveGroup("match2");

      const snapshot = store.getSnapshot();
      // When match2 joins above (match1), it creates new group [match1, match2]
      // The original group [match2, match3] becomes [match3]
      expect(snapshot.groupings).toEqual([["match3"], ["match1", "match2"]]);
    });
  });

  describe("addToBelowGroup", () => {
    beforeEach(() => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "loaded", data: mockMatchHistory },
        selectedMatchIds: new Set(),
        groupings: [["match2", "match3"]],
      });
    });

    it("does nothing for last match", () => {
      presenter.addToBelowGroup("match3");

      const snapshot = store.getSnapshot();
      expect(snapshot.groupings).toEqual([["match2", "match3"]]);
    });

    it("adds match to existing below group", () => {
      presenter.addToBelowGroup("match1");

      const snapshot = store.getSnapshot();
      expect(snapshot.groupings).toEqual([["match1", "match2", "match3"]]);
    });
  });

  describe("breakFromGroup", () => {
    it("removes match from its group", () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "loaded", data: mockMatchHistory },
        selectedMatchIds: new Set(),
        groupings: [["match1", "match2", "match3"]],
      });

      presenter.breakFromGroup("match2");

      const snapshot = store.getSnapshot();
      expect(snapshot.groupings).toEqual([["match1", "match3"]]);
    });

    it("removes empty groups after breaking", () => {
      store.setSnapshot({
        gamertag: "TestPlayer",
        state: { type: "loaded", data: mockMatchHistory },
        selectedMatchIds: new Set(),
        groupings: [["match1"], ["match2"]],
      });

      presenter.breakFromGroup("match1");

      const snapshot = store.getSnapshot();
      expect(snapshot.groupings).toEqual([["match2"]]);
    });
  });
});
