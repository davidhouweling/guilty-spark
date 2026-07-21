import { describe, expect, it } from "vitest";
import type { KillMatrixViewRow } from "../../../../controllers/stats/kill-matrix/types";
import { KillMatrixStore } from "../kill-matrix-store";

describe("KillMatrixStore", () => {
  it("updates through loading and loaded states", () => {
    const store = new KillMatrixStore();
    const snapshots: string[] = [];
    const unsubscribe = store.subscribe(() => {
      snapshots.push(store.getSnapshot().status);
    });

    store.setLoading();
    store.setLoaded([
      {
        key: "111:222",
        killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
        victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
        classification: "enemy-kill",
        count: 3,
        headshotKills: 1,
        perfects: 0,
        weapons: [],
      },
    ] satisfies readonly KillMatrixViewRow[]);

    unsubscribe();

    expect(snapshots).toEqual(["loading", "loaded"]);
    const state = store.getSnapshot();
    expect(state.status).toBe("loaded");
    if (state.status === "loaded") {
      expect(state.rows).toHaveLength(1);
    }
  });

  it("sets error state", () => {
    const store = new KillMatrixStore();

    store.setError("Failed to load kill matrix");

    expect(store.getSnapshot()).toEqual({ status: "error", message: "Failed to load kill matrix" });
  });
});
