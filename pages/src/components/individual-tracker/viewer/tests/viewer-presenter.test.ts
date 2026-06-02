import { afterEach, describe, expect, it, vi } from "vitest";
import { ComponentLoaderStatus } from "../../../component-loader/component-loader";
import {
  aFakeIndividualTrackerViewServiceWith,
  aFakeTrackerLiveViewWith,
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerViewStateWith,
} from "../../../../services/individual-tracker/fakes/view.fake";
import type { FakeIndividualTrackerViewService } from "../../../../services/individual-tracker/fakes/view.fake";
import { IndividualTrackerViewerPresenter } from "../viewer-presenter";
import { IndividualTrackerViewerStore } from "../viewer-store";

interface Harness {
  readonly service: FakeIndividualTrackerViewService;
  readonly store: IndividualTrackerViewerStore;
  readonly presenter: IndividualTrackerViewerPresenter;
}

function aHarness(service: FakeIndividualTrackerViewService): Harness {
  const store = new IndividualTrackerViewerStore();
  const presenter = new IndividualTrackerViewerPresenter({
    individualTrackerViewService: service,
    store,
    trackerId: "tracker-1",
  });
  return { service, store, presenter };
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
