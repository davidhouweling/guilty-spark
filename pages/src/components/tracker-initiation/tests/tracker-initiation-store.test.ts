import { describe, it, expect, beforeEach, vi } from "vitest";
import { TrackerInitiationStore } from "../tracker-initiation-store";

describe("TrackerInitiationStore", () => {
  let store: TrackerInitiationStore;

  beforeEach(() => {
    store = new TrackerInitiationStore("TestPlayer");
  });

  describe("initialization", () => {
    it("initializes with provided gamertag", () => {
      const snapshot = store.getSnapshot();
      expect(snapshot.gamertag).toBe("TestPlayer");
    });

    it("initializes with idle state", () => {
      const snapshot = store.getSnapshot();
      expect(snapshot.state.type).toBe("idle");
    });

    it("initializes with empty selected matches", () => {
      const snapshot = store.getSnapshot();
      expect(snapshot.selectedMatchIds.size).toBe(0);
    });

    it("initializes with empty groupings", () => {
      const snapshot = store.getSnapshot();
      expect(snapshot.groupings).toEqual([]);
    });
  });

  describe("subscribe", () => {
    it("notifies subscribers when snapshot changes", () => {
      const listener = vi.fn();
      store.subscribe(listener);

      const current = store.getSnapshot();
      store.setSnapshot({
        ...current,
        gamertag: "NewPlayer",
      });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("supports multiple subscribers", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      store.subscribe(listener1);
      store.subscribe(listener2);

      const current = store.getSnapshot();
      store.setSnapshot({
        ...current,
        gamertag: "NewPlayer",
      });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it("allows unsubscribing", () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      unsubscribe();

      const current = store.getSnapshot();
      store.setSnapshot({
        ...current,
        gamertag: "NewPlayer",
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("setSnapshot", () => {
    it("updates snapshot", () => {
      const current = store.getSnapshot();
      store.setSnapshot({
        ...current,
        gamertag: "NewPlayer",
      });

      const updated = store.getSnapshot();
      expect(updated.gamertag).toBe("NewPlayer");
    });

    it("preserves immutability", () => {
      const before = store.getSnapshot();
      store.setSnapshot({
        ...before,
        gamertag: "NewPlayer",
      });

      expect(before.gamertag).toBe("TestPlayer");
    });
  });
});
