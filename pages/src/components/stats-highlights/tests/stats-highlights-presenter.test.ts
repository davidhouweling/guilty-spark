import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IndividualStatsHighlightOption } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { StatsHighlightsSectionPresenter } from "../stats-highlights-presenter";
import { StatsHighlightsSectionStore } from "../stats-highlights-store";

interface Harness {
  readonly presenter: StatsHighlightsSectionPresenter;
  readonly store: StatsHighlightsSectionStore;
  readonly onStatsHighlightSlotsChange: ReturnType<
    typeof vi.fn<(statsHighlightSlots: readonly IndividualStatsHighlightOption[]) => void>
  >;
}

function aHarness(): Harness {
  const store = new StatsHighlightsSectionStore();
  const onStatsHighlightSlotsChange = vi.fn<(statsHighlightSlots: readonly IndividualStatsHighlightOption[]) => void>();
  const presenter = new StatsHighlightsSectionPresenter({
    store,
    onStatsHighlightSlotsChange,
  });

  return {
    presenter,
    store,
    onStatsHighlightSlotsChange,
  };
}

describe("StatsHighlightsSectionPresenter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("syncInput", () => {
    it("derives a disabled default state when slots are empty", () => {
      const { presenter, store } = aHarness();

      presenter.syncInput({
        statsHighlightSlots: [],
        saveStatus: "idle",
        saveErrorMessage: null,
      });

      expect(store.getSnapshot().isEnabled).toBe(false);
      expect(store.getSnapshot().slotCount).toBe(6);
      expect(store.getSnapshot().configuredSlots).toEqual([
        "matches-win-loss",
        "series-win-loss",
        "kills-deaths-assists-kda",
        "damage-dealt-taken-ratio",
        "avg-life-damage-per-life",
        "current-rank",
      ]);
    });

    it("keeps the save toast visible while saving and after saving completes", () => {
      const { presenter, store } = aHarness();

      presenter.syncInput({
        statsHighlightSlots: [],
        saveStatus: "saving",
        saveErrorMessage: null,
      });
      expect(store.getSnapshot().showSaveToast).toBe(true);

      presenter.syncInput({
        statsHighlightSlots: [],
        saveStatus: "saved",
        saveErrorMessage: null,
      });
      expect(store.getSnapshot().showSaveToast).toBe(true);
    });

    it("hides the save toast after delay when save status is not saving", async () => {
      const { presenter, store } = aHarness();

      presenter.syncInput({
        statsHighlightSlots: [],
        saveStatus: "saving",
        saveErrorMessage: null,
      });
      presenter.syncInput({
        statsHighlightSlots: [],
        saveStatus: "saved",
        saveErrorMessage: null,
      });

      await vi.advanceTimersByTimeAsync(2200);

      expect(store.getSnapshot().showSaveToast).toBe(false);
    });
  });

  describe("slot mutations", () => {
    it("setEnabled(true) emits default six slots", () => {
      const { presenter, onStatsHighlightSlotsChange } = aHarness();

      presenter.syncInput({
        statsHighlightSlots: [],
        saveStatus: "idle",
        saveErrorMessage: null,
      });
      presenter.setEnabled(true);

      expect(onStatsHighlightSlotsChange).toHaveBeenCalledWith([
        "matches-win-loss",
        "series-win-loss",
        "kills-deaths-assists-kda",
        "damage-dealt-taken-ratio",
        "avg-life-damage-per-life",
        "current-rank",
      ]);
    });

    it("setSlotCount(8) expands to eight configured slots", () => {
      const { presenter, store, onStatsHighlightSlotsChange } = aHarness();

      presenter.syncInput({
        statsHighlightSlots: [
          "matches-win-loss",
          "series-win-loss",
          "kills-deaths-assists-kda",
          "damage-dealt-taken-ratio",
          "avg-life-damage-per-life",
          "current-rank",
        ],
        saveStatus: "idle",
        saveErrorMessage: null,
      });
      presenter.setSlotCount(8);

      expect(store.getSnapshot().configuredSlots).toHaveLength(8);
      expect(onStatsHighlightSlotsChange).toHaveBeenCalledWith([
        "matches-win-loss",
        "series-win-loss",
        "kills-deaths-assists-kda",
        "damage-dealt-taken-ratio",
        "avg-life-damage-per-life",
        "current-rank",
        "all-time-peak",
        "esra",
      ]);
    });

    it("setSlotValue updates the selected slot and emits changed slots", () => {
      const { presenter, onStatsHighlightSlotsChange } = aHarness();

      presenter.syncInput({
        statsHighlightSlots: ["matches-win-loss", "series-win-loss"],
        saveStatus: "idle",
        saveErrorMessage: null,
      });
      presenter.setSlotValue(0, "esra");

      expect(onStatsHighlightSlotsChange).toHaveBeenCalledWith(["esra", "series-win-loss"]);
    });
  });

  describe("present", () => {
    it("returns the expected grouped option labels", () => {
      const { presenter, store } = aHarness();

      const model = presenter.present(store.getSnapshot());

      expect(model.optionGroups.map((group) => group.label)).toEqual([
        "Individual stats",
        "Compacted stats",
        "Profile stats",
      ]);
    });
  });

  describe("dispose", () => {
    it("stops emitting changes after dispose", () => {
      const { presenter, onStatsHighlightSlotsChange } = aHarness();

      presenter.dispose();
      presenter.setEnabled(true);

      expect(onStatsHighlightSlotsChange).not.toHaveBeenCalled();
    });
  });
});
