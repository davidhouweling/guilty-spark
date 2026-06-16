import { afterEach, describe, expect, it, vi } from "vitest";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { Mocked } from "vitest";
import { ComponentLoaderStatus } from "../../../component-loader/component-loader";
import {
  aFakeIndividualTrackerViewServiceWith,
  aFakeTrackerLiveViewWith,
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerViewStateWith,
} from "../../../../services/individual-tracker/fakes/view.fake";
import type { FakeIndividualTrackerViewService } from "../../../../services/individual-tracker/fakes/view.fake";
import { aFakeHaloClientWith } from "../../../../services/fakes/halo-client.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../../services/stats/fakes/match-analytics.fake";
import type { MatchAnalyticsService } from "../../../../services/stats/match-analytics-types";
import { aFakeMatchStatsWith } from "../../../../controllers/stats/fakes/data";
import { IndividualTrackerViewerPresenter } from "../viewer-presenter";
import { IndividualTrackerViewerStore } from "../viewer-store";

interface Harness {
  readonly service: FakeIndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly haloClient: Mocked<Pick<HaloInfiniteClient, "getMatchStats" | "getUsers" | "getMedalsMetadataFile">>;
  readonly store: IndividualTrackerViewerStore;
  readonly presenter: IndividualTrackerViewerPresenter;
}

function aHarness(
  service: FakeIndividualTrackerViewService,
  matchAnalyticsService: MatchAnalyticsService = aFakeMatchAnalyticsServiceWith(),
): Harness {
  const store = new IndividualTrackerViewerStore();
  const haloClient = {
    getMatchStats: vi.fn<HaloInfiniteClient["getMatchStats"]>().mockResolvedValue(aFakeMatchStatsWith()),
    getUsers: vi.fn<HaloInfiniteClient["getUsers"]>().mockResolvedValue([]),
    getMedalsMetadataFile: vi
      .fn<HaloInfiniteClient["getMedalsMetadataFile"]>()
      .mockResolvedValue({ difficulties: [], types: [], sprites: {}, medals: [] }),
  };
  const presenter = new IndividualTrackerViewerPresenter({
    individualTrackerViewService: service,
    matchAnalyticsService,
    haloClient: aFakeHaloClientWith(haloClient),
    store,
    trackerId: "tracker-1",
  });
  return { service, matchAnalyticsService, haloClient, store, presenter };
}

describe("IndividualTrackerViewerPresenter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("start", () => {
    it("loads the view into a loaded snapshot", async () => {
      const service = aFakeIndividualTrackerViewServiceWith({
        view: aFakeTrackerViewStateWith({ gamertag: "Spartan One" }),
      });
      const { store, presenter } = aHarness(service);

      presenter.start();
      await vi.waitFor(() => {
        expect(store.getSnapshot().status).toBe(ComponentLoaderStatus.LOADED);
      });

      expect(store.getSnapshot().view?.gamertag).toBe("Spartan One");
    });

    it("present yields a render model from the loaded view", async () => {
      const service = aFakeIndividualTrackerViewServiceWith({
        view: aFakeTrackerViewStateWith({ gamertag: "Spartan One" }),
      });
      const { store, presenter } = aHarness(service);

      presenter.start();
      await vi.waitFor(() => {
        expect(store.getSnapshot().status).toBe(ComponentLoaderStatus.LOADED);
      });

      const model = IndividualTrackerViewerPresenter.present(store.getSnapshot());
      expect(model.renderModel?.gamertag).toBe("Spartan One");
    });

    it("sets an error snapshot when the view fails to load", async () => {
      const service = aFakeIndividualTrackerViewServiceWith();
      vi.spyOn(service, "getView").mockRejectedValue(new Error("View unavailable"));
      const { store, presenter } = aHarness(service);

      presenter.start();
      await vi.waitFor(() => {
        expect(store.getSnapshot().status).toBe(ComponentLoaderStatus.ERROR);
      });

      expect(store.getSnapshot().errorMessage).toBe("View unavailable");
    });
  });

  describe("connection", () => {
    it("updates the view when the connection emits a new view", async () => {
      const service = aFakeIndividualTrackerViewServiceWith();
      const { store, presenter } = aHarness(service);

      presenter.start();
      await vi.waitFor(() => {
        expect(service.lastConnection).not.toBeNull();
      });

      const updated = aFakeTrackerLiveViewWith({
        matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-2", mapName: "Recharge" })],
      });
      service.lastConnection?.emitView(updated);

      expect(store.getSnapshot().view?.matches[0]?.mapName).toBe("Recharge");
    });

    it("updates the connection status when the connection emits a status", async () => {
      const service = aFakeIndividualTrackerViewServiceWith();
      const { store, presenter } = aHarness(service);

      presenter.start();
      await vi.waitFor(() => {
        expect(service.lastConnection).not.toBeNull();
      });

      service.lastConnection?.emitStatus("disconnected");

      expect(store.getSnapshot().connectionStatus).toBe("disconnected");
    });
  });

  describe("selectMatch", () => {
    it("sets selectedMatchId in the store and transitions matchStatsState to loaded", async () => {
      const fakeStats = aFakeMatchStatsWith({ MatchId: "m-99" });
      const service = aFakeIndividualTrackerViewServiceWith();
      const { haloClient, matchAnalyticsService, store, presenter } = aHarness(service);
      haloClient.getMatchStats.mockResolvedValue(fakeStats);
      const getMatchAnalyticsSpy = vi.spyOn(matchAnalyticsService, "getMatchAnalytics");

      presenter.selectMatch("m-99");

      expect(store.getSnapshot().selectedMatchId).toBe("m-99");
      expect(store.getSnapshot().matchStatsState?.status).toBe("loading");

      await vi.waitFor(() => {
        expect(store.getSnapshot().matchStatsState?.status).toBe("loaded");
      });

      const statsState = store.getSnapshot().matchStatsState;
      if (statsState?.status === "loaded") {
        expect(statsState.stats.MatchId).toBe("m-99");
        expect(statsState.analytics).not.toBeNull();
      }
      expect(getMatchAnalyticsSpy).toHaveBeenCalledWith("m-99");
    });

    it("falls back to null analytics when analytics fetch fails", async () => {
      const service = aFakeIndividualTrackerViewServiceWith();
      const matchAnalyticsService = aFakeMatchAnalyticsServiceWith();
      vi.spyOn(matchAnalyticsService, "getMatchAnalytics").mockRejectedValue(new Error("analytics failed"));
      const { store, presenter } = aHarness(service, matchAnalyticsService);

      presenter.selectMatch("m-1");

      await vi.waitFor(() => {
        expect(store.getSnapshot().matchStatsState?.status).toBe("loaded");
      });

      const statsState = store.getSnapshot().matchStatsState;
      if (statsState?.status === "loaded") {
        expect(statsState.analytics).toBeNull();
      }
    });

    it("discards a stale result when the match is deselected before the response arrives", async () => {
      const service = aFakeIndividualTrackerViewServiceWith();
      let resolveStats!: (stats: Awaited<ReturnType<HaloInfiniteClient["getMatchStats"]>>) => void;
      const { haloClient, store, presenter } = aHarness(service);
      haloClient.getMatchStats.mockReturnValue(
        new Promise((resolve) => {
          resolveStats = resolve;
        }),
      );

      presenter.selectMatch("m-1");
      presenter.deselectMatch();
      resolveStats(aFakeMatchStatsWith({ MatchId: "m-1" }));

      await Promise.resolve();

      expect(store.getSnapshot().selectedMatchId).toBeNull();
      expect(store.getSnapshot().matchStatsState).toBeNull();
    });

    it("discards a superseded result when a second selectMatch fires before the first resolves", async () => {
      const service = aFakeIndividualTrackerViewServiceWith();
      let resolveA!: (stats: Awaited<ReturnType<HaloInfiniteClient["getMatchStats"]>>) => void;
      const { haloClient, store, presenter } = aHarness(service);
      const statsA = aFakeMatchStatsWith({ MatchId: "m-A" });
      const statsB = aFakeMatchStatsWith({ MatchId: "m-B" });

      haloClient.getMatchStats
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveA = resolve;
          }),
        )
        .mockResolvedValueOnce(statsB);

      presenter.selectMatch("m-A");
      presenter.selectMatch("m-B");

      await vi.waitFor(() => {
        expect(store.getSnapshot().matchStatsState?.status).toBe("loaded");
      });

      resolveA(statsA);
      await Promise.resolve();

      const state = store.getSnapshot().matchStatsState;
      expect(store.getSnapshot().selectedMatchId).toBe("m-B");
      if (state?.status === "loaded") {
        expect(state.stats.MatchId).toBe("m-B");
      } else {
        expect(state?.status).toBe("loaded");
      }
    });

    it("discards a stale error when the match is deselected before a rejection arrives", async () => {
      const service = aFakeIndividualTrackerViewServiceWith();
      let rejectStats!: (error: Error) => void;
      const { haloClient, store, presenter } = aHarness(service);
      haloClient.getMatchStats.mockReturnValue(
        new Promise((_, reject) => {
          rejectStats = reject;
        }),
      );
      const setMatchStatsErrorSpy = vi.spyOn(store, "setMatchStatsError");

      presenter.selectMatch("m-1");
      presenter.deselectMatch();
      rejectStats(new Error("Network failure"));

      await Promise.resolve();
      await Promise.resolve();

      expect(setMatchStatsErrorSpy).not.toHaveBeenCalled();
      expect(store.getSnapshot().selectedMatchId).toBeNull();
      expect(store.getSnapshot().matchStatsState).toBeNull();
    });

    it("sets matchStatsState to error when getMatchStats rejects", async () => {
      const service = aFakeIndividualTrackerViewServiceWith();
      const { haloClient, store, presenter } = aHarness(service);
      haloClient.getMatchStats.mockRejectedValue(new Error("Network failure"));

      presenter.selectMatch("m-err");

      await vi.waitFor(() => {
        expect(store.getSnapshot().matchStatsState?.status).toBe("error");
      });

      const statsState = store.getSnapshot().matchStatsState;
      if (statsState?.status === "error") {
        expect(statsState.message).toBe("Network failure");
      }
      expect(store.getSnapshot().matchStatsState?.status).toBe("error");
    });
  });

  describe("deselectMatch", () => {
    it("clears selectedMatchId and matchStatsState", () => {
      const service = aFakeIndividualTrackerViewServiceWith();
      const { store, presenter } = aHarness(service);

      presenter.selectMatch("m-1");
      presenter.deselectMatch();

      expect(store.getSnapshot().selectedMatchId).toBeNull();
      expect(store.getSnapshot().matchStatsState).toBeNull();
    });
  });

  describe("dispose", () => {
    it("ignores view updates emitted after dispose", async () => {
      const service = aFakeIndividualTrackerViewServiceWith({
        view: aFakeTrackerViewStateWith({
          matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1", mapName: "Live Fire" })],
        }),
      });
      const { store, presenter } = aHarness(service);

      presenter.start();
      await vi.waitFor(() => {
        expect(service.lastConnection).not.toBeNull();
      });

      const connection = service.lastConnection;
      presenter.dispose();
      connection?.emitView(
        aFakeTrackerLiveViewWith({
          matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-9", mapName: "Aquarius" })],
        }),
      );

      expect(store.getSnapshot().view?.matches[0]?.mapName).toBe("Live Fire");
    });
  });
});
