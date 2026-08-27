import { describe, expect, it, vi } from "vitest";
import type { ActiveSeriesSummary } from "@guilty-spark/shared/contracts/neatqueue/active-series";
import type { Tracker } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import {
  aFakeNeatQueueClientServiceWith,
  aFakeActiveSeriesSummaryWith,
} from "../../../../services/neatqueue/fakes/neatqueue.fake";
import type { FakeNeatQueueClientService } from "../../../../services/neatqueue/fakes/neatqueue.fake";
import {
  aFakeIndividualTrackerServiceWith,
  aFakeTrackerWith,
} from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import type { FakeIndividualTrackerService } from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import { LiveNeatQueueSeriesPresenter } from "../live-neatqueue-series-presenter";
import { LiveNeatQueueSeriesStore } from "../live-neatqueue-series-store";

interface Harness {
  neatQueueService: FakeNeatQueueClientService;
  individualTrackerService: FakeIndividualTrackerService;
  store: LiveNeatQueueSeriesStore;
  presenter: LiveNeatQueueSeriesPresenter;
  onTrackerCreated: () => void;
}

function aHarness(opts: { series?: readonly ActiveSeriesSummary[] } = {}): Harness {
  const neatQueueService = aFakeNeatQueueClientServiceWith(opts.series);
  const individualTrackerService = aFakeIndividualTrackerServiceWith({ trackers: [] });
  const store = new LiveNeatQueueSeriesStore();
  const onTrackerCreated = vi.fn<() => void>();
  const presenter = new LiveNeatQueueSeriesPresenter({
    neatQueueService,
    individualTrackerService,
    store,
    onTrackerCreated,
  });
  return { neatQueueService, individualTrackerService, store, presenter, onTrackerCreated };
}

describe("LiveNeatQueueSeriesPresenter", () => {
  it("loads active series on start", async () => {
    const series = aFakeActiveSeriesSummaryWith({ guildId: "guild-1", queueNumber: 5 });
    const { presenter } = aHarness({ series: [series] });

    presenter.start();
    await vi.waitFor(() => {
      expect(presenter.getSnapshot().loading).toBe(false);
    });

    expect(presenter.getSnapshot().series).toEqual([series]);
    expect(presenter.getSeriesCards()).toEqual([
      {
        guildId: "guild-1",
        queueNumber: 5,
        title: series.title,
        subtitle: series.subtitle,
        guildIconUrl: series.guildIconUrl,
        teamNames: series.teams.map((t) => t.name),
        busy: false,
      },
    ]);
  });

  it("surfaces an error message when loading fails", async () => {
    const { neatQueueService, presenter } = aHarness();
    vi.spyOn(neatQueueService, "listActiveSeries").mockRejectedValue(new Error("boom"));

    presenter.start();
    await vi.waitFor(() => {
      expect(presenter.getSnapshot().loading).toBe(false);
    });

    expect(presenter.getSnapshot().errorMessage).toBe("boom");
  });

  it("track() starts a series tracker and opens the dialog in start mode without going live", async () => {
    const series = aFakeActiveSeriesSummaryWith({
      guildId: "guild-1",
      queueNumber: 5,
      title: "Test Server",
      subtitle: "Queue #5",
      teams: [{ id: 0, name: "Eagle", players: [{ gamertag: "Chief", xboxId: "xuid-1" }] }],
    });
    const { individualTrackerService, presenter } = aHarness({ series: [series] });
    const startSeriesTrackerSpy = vi.spyOn(individualTrackerService, "startSeriesTracker");
    const selectActiveSpy = vi.spyOn(individualTrackerService, "selectActive");

    presenter.start();
    await vi.waitFor(() => {
      expect(presenter.getSnapshot().loading).toBe(false);
    });

    presenter.track(series.guildId, series.queueNumber);
    await vi.waitFor(() => {
      expect(presenter.getSnapshot().dialogState).not.toBeNull();
    });

    expect(startSeriesTrackerSpy).toHaveBeenCalledWith({ guildId: "guild-1", queueNumber: 5 });
    const { dialogState } = presenter.getSnapshot();
    expect(dialogState?.goLiveOnSubmit).toBe(false);
    expect(dialogState?.initialData).toEqual({
      title: "Test Server",
      subtitle: "Queue #5",
      teams: [{ name: "Eagle", members: ["Chief"] }],
    });

    presenter.handleSeriesStarted();
    await vi.waitFor(() => {
      expect(presenter.getSnapshot().dialogState).toBeNull();
    });
    expect(selectActiveSpy).not.toHaveBeenCalled();
  });

  it("goLive() sets the tracker live once the dialog's series-started callback fires", async () => {
    const series = aFakeActiveSeriesSummaryWith({ guildId: "guild-1", queueNumber: 5 });
    const { individualTrackerService, presenter, onTrackerCreated } = aHarness({ series: [series] });
    const selectActiveSpy = vi.spyOn(individualTrackerService, "selectActive");

    presenter.start();
    await vi.waitFor(() => {
      expect(presenter.getSnapshot().loading).toBe(false);
    });

    presenter.goLive(series.guildId, series.queueNumber);
    await vi.waitFor(() => {
      expect(presenter.getSnapshot().dialogState).not.toBeNull();
    });
    const trackerId = presenter.getSnapshot().dialogState?.trackerId;
    expect(presenter.getSnapshot().dialogState?.goLiveOnSubmit).toBe(true);

    presenter.handleSeriesStarted();
    await vi.waitFor(() => {
      expect(presenter.getSnapshot().dialogState).toBeNull();
    });

    expect(selectActiveSpy).toHaveBeenCalledWith(trackerId);
    expect(onTrackerCreated).toHaveBeenCalledTimes(1);
  });

  it("marks only the acted-upon series card as busy while starting", async () => {
    const seriesA = aFakeActiveSeriesSummaryWith({ guildId: "guild-a", queueNumber: 1 });
    const seriesB = aFakeActiveSeriesSummaryWith({ guildId: "guild-b", queueNumber: 2 });
    const { individualTrackerService, presenter } = aHarness({ series: [seriesA, seriesB] });
    let resolveStart = (): void => undefined;
    vi.spyOn(individualTrackerService, "startSeriesTracker").mockImplementation(
      async () =>
        new Promise<{ tracker: Tracker }>((resolve) => {
          resolveStart = (): void => {
            resolve({ tracker: aFakeTrackerWith({ trackerId: "t1" }) });
          };
        }),
    );

    presenter.start();
    await vi.waitFor(() => {
      expect(presenter.getSnapshot().loading).toBe(false);
    });

    presenter.track(seriesA.guildId, seriesA.queueNumber);
    await vi.waitFor(() => {
      const cards = presenter.getSeriesCards();
      expect(cards.find((c) => c.guildId === "guild-a")?.busy).toBe(true);
    });
    const cards = presenter.getSeriesCards();
    expect(cards.find((c) => c.guildId === "guild-b")?.busy).toBe(false);

    resolveStart();
  });

  it("surfaces an error and does not open a dialog when starting the series tracker fails", async () => {
    const series = aFakeActiveSeriesSummaryWith({ guildId: "guild-1", queueNumber: 5 });
    const { individualTrackerService, presenter } = aHarness({ series: [series] });
    vi.spyOn(individualTrackerService, "startSeriesTracker").mockRejectedValue(new Error("limit reached"));

    presenter.start();
    await vi.waitFor(() => {
      expect(presenter.getSnapshot().loading).toBe(false);
    });

    presenter.track(series.guildId, series.queueNumber);
    await vi.waitFor(() => {
      expect(presenter.getSnapshot().errorMessage).toBe("limit reached");
    });

    expect(presenter.getSnapshot().dialogState).toBeNull();
  });

  it("surfaces an error and does not open a dialog when the series is no longer in the loaded list", async () => {
    const series = aFakeActiveSeriesSummaryWith({ guildId: "guild-1", queueNumber: 5 });
    const { presenter } = aHarness({ series: [series] });

    presenter.start();
    await vi.waitFor(() => {
      expect(presenter.getSnapshot().loading).toBe(false);
    });

    presenter.track("guild-removed", 99);

    expect(presenter.getSnapshot().errorMessage).toBe("This series is no longer active. Refresh and try again.");
    expect(presenter.getSnapshot().dialogState).toBeNull();
  });

  it("closeDialog clears the dialog state", async () => {
    const series = aFakeActiveSeriesSummaryWith({ guildId: "guild-1", queueNumber: 5 });
    const { presenter } = aHarness({ series: [series] });

    presenter.start();
    await vi.waitFor(() => {
      expect(presenter.getSnapshot().loading).toBe(false);
    });

    presenter.track(series.guildId, series.queueNumber);
    await vi.waitFor(() => {
      expect(presenter.getSnapshot().dialogState).not.toBeNull();
    });

    presenter.closeDialog();

    expect(presenter.getSnapshot().dialogState).toBeNull();
  });
});
