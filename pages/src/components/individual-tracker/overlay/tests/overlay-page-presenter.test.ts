import { describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { aFakeMatchStatsWith } from "../../../../controllers/stats/fakes/data";
import { aFakeHaloClientWith } from "../../../../services/fakes/halo-client.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../../services/stats/fakes/match-analytics.fake";
import { OverlayPagePresenter } from "../overlay-page-presenter";
import { OverlayPageStore } from "../overlay-page-store";

function aUsersFor(
  xuids: readonly string[],
): { xuid: string; gamertag: string; gamerpic: { small: string; medium: string; large: string; xlarge: string } }[] {
  return xuids.map((xuid) => ({
    xuid,
    gamertag: `Spartan ${xuid}`,
    gamerpic: { small: "", medium: "", large: "", xlarge: "" },
  }));
}

describe("OverlayPagePresenter", () => {
  it("loads match stats and builds loaded panel state", async () => {
    const store = new OverlayPageStore();
    const getMatchStats = vi.fn(async () => Promise.resolve(aFakeMatchStatsWith({ MatchId: "match-1" })));
    const haloClient = aFakeHaloClientWith({
      getMatchStats,
      getUsers: vi.fn(async (xuids: string[]) => Promise.resolve(aUsersFor(xuids))),
    });

    const presenter = new OverlayPagePresenter({
      store,
      haloClient,
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    });

    presenter.selectMatch("match-1");

    await waitFor(() => {
      expect(store.getSnapshot().matchStatsByMatchId.get("match-1")?.status).toBe("loaded");
    });

    const model = presenter.present(store.getSnapshot());
    expect(model.selectedMatchId).toBe("match-1");
    expect(model.matchStatsState?.status).toBe("loaded");
    expect(model.matchStatsPanelState?.status).toBe("loaded");

    presenter.selectMatch("match-1");
    expect(getMatchStats).toHaveBeenCalledTimes(1);
  });

  it("maps load failures to error states", async () => {
    const store = new OverlayPageStore();
    const haloClient = aFakeHaloClientWith({
      getMatchStats: vi.fn(async () => Promise.reject(new Error("boom"))),
    });

    const presenter = new OverlayPagePresenter({
      store,
      haloClient,
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    });

    presenter.selectMatch("match-1");

    await waitFor(() => {
      expect(store.getSnapshot().matchStatsByMatchId.get("match-1")?.status).toBe("error");
    });

    const model = presenter.present(store.getSnapshot());
    expect(model.selectedMatchId).toBe("match-1");
    expect(model.matchStatsState?.status).toBe("error");
    expect(model.matchStatsPanelState?.status).toBe("error");
  });
});
