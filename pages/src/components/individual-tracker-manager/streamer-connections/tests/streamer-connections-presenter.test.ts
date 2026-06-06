import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { aFakeIndividualTrackerSettingsServiceWith } from "../../../../services/individual-tracker/fakes/settings.fake";
import type { FakeIndividualTrackerSettingsService } from "../../../../services/individual-tracker/fakes/settings.fake";
import { StreamerConnectionsPresenter } from "../streamer-connections-presenter";
import { StreamerConnectionsStore } from "../streamer-connections-store";

interface Harness {
  readonly store: StreamerConnectionsStore;
  readonly presenter: StreamerConnectionsPresenter;
  readonly settingsService: FakeIndividualTrackerSettingsService;
}

function aHarness(settingsService?: FakeIndividualTrackerSettingsService): Harness {
  const service = settingsService ?? aFakeIndividualTrackerSettingsServiceWith();
  const store = new StreamerConnectionsStore();
  const presenter = new StreamerConnectionsPresenter({ settingsService: service, store });
  return { store, presenter, settingsService: service };
}

describe("StreamerConnectionsPresenter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("loadSettings", () => {
    it("applies colorMode from streamer view settings to the store", () => {
      const { store, presenter } = aHarness();

      presenter.loadSettings({ styleFlags: { colorMode: "observer" } }, null);

      expect(store.getSnapshot().defaultColorMode).toBe("observer");
    });

    it("applies player colors from style flags to the store", () => {
      const { store, presenter } = aHarness();

      presenter.loadSettings({ styleFlags: { playerTeamColor: "red", playerEnemyColor: "blue" } }, null);

      expect(store.getSnapshot().playerTeamColor).toBe("red");
      expect(store.getSnapshot().playerEnemyColor).toBe("blue");
    });

    it("applies observer colors from style flags to the store", () => {
      const { store, presenter } = aHarness();

      presenter.loadSettings({ styleFlags: { observerTeamColor: "green", observerEnemyColor: "orange" } }, null);

      expect(store.getSnapshot().observerTeamColor).toBe("green");
      expect(store.getSnapshot().observerEnemyColor).toBe("orange");
    });

    it("applies font sizes from layout options to the store", () => {
      const { store, presenter } = aHarness();

      presenter.loadSettings({ layoutOptions: { fontSizes: { queueInfo: 120, score: 80 } } }, null);

      expect(store.getSnapshot().fontSizeSettings.queueInfo).toBe(120);
      expect(store.getSnapshot().fontSizeSettings.score).toBe(80);
    });

    it("applies display settings from visible sections to the store", () => {
      const { store, presenter } = aHarness();

      presenter.loadSettings({ visibleSections: { showTeamDetails: true, showScore: false } }, null);

      expect(store.getSnapshot().displaySettings.showTeamDetails).toBe(true);
      expect(store.getSnapshot().displaySettings.showScore).toBe(false);
    });

    it("applies ticker settings from visible sections and style flags to the store", () => {
      const { store, presenter } = aHarness();

      presenter.loadSettings(
        {
          visibleSections: { showTicker: false, showTabs: false },
          styleFlags: { showPreSeriesInfo: false },
        },
        null,
      );

      expect(store.getSnapshot().tickerSettings.showTicker).toBe(false);
      expect(store.getSnapshot().tickerSettings.showTabs).toBe(false);
      expect(store.getSnapshot().tickerSettings.showPreSeriesInfo).toBe(false);
    });

    it("sets the gamertag on the store", () => {
      const { store, presenter } = aHarness();

      presenter.loadSettings({}, "gamertag-123");

      expect(store.getSnapshot().gamertag).toBe("gamertag-123");
    });

    it("applies topBarStatSlots from visible sections to the store", () => {
      const { store, presenter } = aHarness();

      presenter.loadSettings({ visibleSections: { topBarStatSlots: ["kills", "deaths"] } }, null);

      expect(store.getSnapshot().topBarStatSlots).toEqual(["kills", "deaths"]);
    });

    it("does nothing when disposed", () => {
      const { store, presenter } = aHarness();

      presenter.dispose();
      presenter.loadSettings({ styleFlags: { colorMode: "observer" } }, "gamertag-123");

      expect(store.getSnapshot().defaultColorMode).toBe("player");
      expect(store.getSnapshot().gamertag).toBeNull();
    });

    it("skips settings reload but updates gamertag when a debounce is pending", () => {
      const { store, presenter } = aHarness();

      presenter.setDefaultColorMode("observer");
      presenter.setPlayerColors("red", "blue");
      presenter.loadSettings(
        { styleFlags: { colorMode: "player", playerTeamColor: "purple", playerEnemyColor: "yellow" } },
        "gamertag-456",
      );

      expect(store.getSnapshot().defaultColorMode).toBe("observer");
      expect(store.getSnapshot().playerTeamColor).toBe("red");
      expect(store.getSnapshot().playerEnemyColor).toBe("blue");
      expect(store.getSnapshot().gamertag).toBe("gamertag-456");
    });
  });

  describe("setDefaultColorMode", () => {
    it("updates the color mode in the store and schedules a debounced save", async () => {
      const { store, presenter, settingsService } = aHarness();
      const updateSpy: MockInstance<typeof settingsService.updateSettings> = vi.spyOn(
        settingsService,
        "updateSettings",
      );

      presenter.setDefaultColorMode("observer");

      expect(store.getSnapshot().defaultColorMode).toBe("observer");
      expect(updateSpy).not.toHaveBeenCalled();

      await vi.runAllTimersAsync();

      expect(updateSpy).toHaveBeenCalledOnce();
      const [[saved]] = updateSpy.mock.calls;
      expect(saved.styleFlags?.colorMode).toBe("observer");
    });

    it("does nothing when disposed", () => {
      const { store, presenter } = aHarness();

      presenter.dispose();
      presenter.setDefaultColorMode("observer");

      expect(store.getSnapshot().defaultColorMode).toBe("player");
    });
  });

  describe("setPlayerColors", () => {
    it("updates player colors in the store and schedules a debounced save", async () => {
      const { store, presenter, settingsService } = aHarness();
      const updateSpy: MockInstance<typeof settingsService.updateSettings> = vi.spyOn(
        settingsService,
        "updateSettings",
      );

      presenter.setPlayerColors("red", "blue");

      expect(store.getSnapshot().playerTeamColor).toBe("red");
      expect(store.getSnapshot().playerEnemyColor).toBe("blue");

      await vi.runAllTimersAsync();

      const [[saved]] = updateSpy.mock.calls;
      expect(saved.styleFlags?.playerTeamColor).toBe("red");
      expect(saved.styleFlags?.playerEnemyColor).toBe("blue");
    });
  });

  describe("setObserverColors", () => {
    it("updates observer colors in the store and schedules a debounced save", async () => {
      const { store, presenter, settingsService } = aHarness();
      const updateSpy: MockInstance<typeof settingsService.updateSettings> = vi.spyOn(
        settingsService,
        "updateSettings",
      );

      presenter.setObserverColors("green", "orange");

      expect(store.getSnapshot().observerTeamColor).toBe("green");
      expect(store.getSnapshot().observerEnemyColor).toBe("orange");

      await vi.runAllTimersAsync();

      const [[saved]] = updateSpy.mock.calls;
      expect(saved.styleFlags?.observerTeamColor).toBe("green");
      expect(saved.styleFlags?.observerEnemyColor).toBe("orange");
    });
  });

  describe("setDisplaySettings", () => {
    it("merges partial display settings and schedules a save", () => {
      const { store, presenter } = aHarness();

      presenter.setDisplaySettings({ showTeamDetails: true });

      expect(store.getSnapshot().displaySettings.showTeamDetails).toBe(true);
      expect(store.getSnapshot().displaySettings.showScore).toBe(true);
    });
  });

  describe("setTickerSettings", () => {
    it("merges partial ticker settings and schedules a save", () => {
      const { store, presenter } = aHarness();

      presenter.setTickerSettings({ showTicker: false });

      expect(store.getSnapshot().tickerSettings.showTicker).toBe(false);
      expect(store.getSnapshot().tickerSettings.showTabs).toBe(true);
    });
  });

  describe("setFontSizes", () => {
    it("merges partial font size settings and schedules a save", async () => {
      const { store, presenter, settingsService } = aHarness();
      const updateSpy: MockInstance<typeof settingsService.updateSettings> = vi.spyOn(
        settingsService,
        "updateSettings",
      );

      presenter.setFontSizes({ queueInfo: 120 });

      expect(store.getSnapshot().fontSizeSettings.queueInfo).toBe(120);
      expect(store.getSnapshot().fontSizeSettings.score).toBe(100);

      await vi.runAllTimersAsync();

      const [[saved]] = updateSpy.mock.calls;
      expect(saved.layoutOptions?.fontSizes?.queueInfo).toBe(120);
      expect(saved.layoutOptions?.fontSizes?.score).toBe(100);
    });
  });

  describe("snapshotToSettings round-trip", () => {
    it("preserves topBarStatSlots in the save payload", async () => {
      const { presenter, settingsService } = aHarness();
      const updateSpy: MockInstance<typeof settingsService.updateSettings> = vi.spyOn(
        settingsService,
        "updateSettings",
      );

      presenter.loadSettings({ visibleSections: { topBarStatSlots: ["kills", "deaths"] } }, null);
      presenter.setDefaultColorMode("observer");

      await vi.runAllTimersAsync();

      const [[saved]] = updateSpy.mock.calls;
      expect(saved.visibleSections?.topBarStatSlots).toEqual(["kills", "deaths"]);
    });

    it("preserves topBarStatSlots in the store snapshot after save response is applied", async () => {
      const { store, presenter } = aHarness();

      presenter.loadSettings({ visibleSections: { topBarStatSlots: ["kills", "deaths"] } }, null);
      presenter.setDefaultColorMode("observer");

      await vi.runAllTimersAsync();

      expect(store.getSnapshot().topBarStatSlots).toEqual(["kills", "deaths"]);
    });
  });

  describe("debounced save", () => {
    it("coalesces multiple rapid changes into a single save call", async () => {
      const { presenter, settingsService } = aHarness();
      const updateSpy: MockInstance = vi.spyOn(settingsService, "updateSettings");

      presenter.setDefaultColorMode("observer");
      presenter.setPlayerColors("red", "blue");
      presenter.setObserverColors("green", "orange");

      await vi.runAllTimersAsync();

      expect(updateSpy).toHaveBeenCalledOnce();
    });

    it("sets saveStatus to saving then saved on success", async () => {
      const { store, presenter } = aHarness();

      presenter.setDefaultColorMode("observer");

      expect(store.getSnapshot().saveStatus).toBe("idle");

      vi.advanceTimersByTime(450);
      expect(store.getSnapshot().saveStatus).toBe("saving");

      await vi.runAllTimersAsync();

      expect(store.getSnapshot().saveStatus).toBe("saved");
      expect(store.getSnapshot().saveErrorMessage).toBeNull();
    });

    it("sets saveStatus to error when the save fails", async () => {
      const settingsService = aFakeIndividualTrackerSettingsServiceWith();
      vi.spyOn(settingsService, "updateSettings").mockRejectedValue(new Error("Network error"));
      const { store, presenter } = aHarness(settingsService);

      presenter.setDefaultColorMode("observer");

      await vi.runAllTimersAsync();

      expect(store.getSnapshot().saveStatus).toBe("error");
      expect(store.getSnapshot().saveErrorMessage).toBe("Network error");
    });

    it("does not call setSaved after dispose when a save is in flight", async () => {
      const { store, presenter } = aHarness();

      presenter.setDefaultColorMode("observer");
      vi.advanceTimersByTime(450);
      expect(store.getSnapshot().saveStatus).toBe("saving");

      presenter.dispose();
      await vi.runAllTimersAsync();

      expect(store.getSnapshot().saveStatus).toBe("saving");
    });

    it("cancels the pending debounce timer on dispose", () => {
      const { settingsService, presenter } = aHarness();
      const updateSpy: MockInstance = vi.spyOn(settingsService, "updateSettings");

      presenter.setDefaultColorMode("observer");
      presenter.dispose();

      vi.advanceTimersByTime(1000);

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });
});
