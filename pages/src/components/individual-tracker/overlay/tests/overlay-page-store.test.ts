import { describe, expect, it } from "vitest";
import { ComponentLoaderStatus } from "../../../component-loader/component-loader";
import { aFakeMatchStatsWith } from "../../../../controllers/stats/fakes/data";
import { OverlayPageStore } from "../overlay-page-store";

describe("OverlayPageStore", () => {
  it("updates selected match and stores match states", () => {
    const store = new OverlayPageStore();

    store.setSelectedMatchId("match-1");
    store.setMatchStatsState("match-1", {
      status: "loaded",
      stats: aFakeMatchStatsWith({ MatchId: "match-1" }),
      playerMap: new Map([["xuid-1", "Spartan"]]),
      medalMetadata: {},
      analytics: null,
      analyticsStatus: ComponentLoaderStatus.LOADED,
    });

    const snapshot = store.getSnapshot();
    expect(snapshot.selectedMatchId).toBe("match-1");
    expect(snapshot.matchStatsByMatchId.get("match-1")?.status).toBe("loaded");
  });

  it("resets to empty snapshot", () => {
    const store = new OverlayPageStore();

    store.setSelectedMatchId("match-1");
    store.setMatchStatsState("match-1", { status: "error", message: "boom" });

    store.reset();

    const snapshot = store.getSnapshot();
    expect(snapshot.selectedMatchId).toBeNull();
    expect(snapshot.matchStatsByMatchId.size).toBe(0);
  });
});
