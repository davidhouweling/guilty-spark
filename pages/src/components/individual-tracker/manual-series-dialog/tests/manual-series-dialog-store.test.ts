import { describe, expect, it } from "vitest";
import { ManualSeriesDialogStore } from "../manual-series-dialog-store";
import type { SeriesInitialData } from "../manual-series-dialog-store";

const initialData: SeriesInitialData = {
  title: "Test Server",
  subtitle: "Queue #5",
  teams: [{ name: "Team A", members: ["Chief"] }],
};

describe("ManualSeriesDialogStore", () => {
  it("defaults to edit mode when initialData is provided and no mode is given", () => {
    const store = new ManualSeriesDialogStore(initialData);

    expect(store.getSnapshot().mode).toBe("edit");
  });

  it("defaults to start mode when no initialData is given", () => {
    const store = new ManualSeriesDialogStore();

    expect(store.getSnapshot().mode).toBe("start");
  });

  it("forces start mode even with initialData when mode is explicitly start", () => {
    const store = new ManualSeriesDialogStore(initialData, "start");

    const snapshot = store.getSnapshot();
    expect(snapshot.mode).toBe("start");
    expect(snapshot.titleOverride).toBe("Test Server");
    expect(snapshot.subtitleOverride).toBe("Queue #5");
    expect(snapshot.teams).toEqual([{ name: "Team A", members: ["Chief"] }]);
  });

  it("preserves the forced mode across reset when no override is passed", () => {
    const store = new ManualSeriesDialogStore(initialData, "start");

    store.reset();

    expect(store.getSnapshot().mode).toBe("start");
  });

  it("re-applies a forced mode passed explicitly to reset", () => {
    const store = new ManualSeriesDialogStore(initialData, "start");

    store.reset(initialData, "start");

    expect(store.getSnapshot().mode).toBe("start");
  });

  it("lets an explicit reset override discard a previously forced mode", () => {
    const store = new ManualSeriesDialogStore(initialData, "start");

    store.reset(initialData, "edit");

    expect(store.getSnapshot().mode).toBe("edit");
  });
});
