import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStreamerSettings } from "../use-streamer-settings";
import { DEFAULT_ALL_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from "../types";
import type { GlobalStreamerSettings } from "../types";

const STORAGE_KEY_GLOBAL = "live-tracker-streamer-settings-global";

describe("useStreamerSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("returns default settings when localStorage is empty", () => {
    const { result } = renderHook(() => useStreamerSettings());

    expect(result.current.settings).toEqual(DEFAULT_ALL_SETTINGS);
  });

  it("loads global settings from localStorage on initialization", () => {
    const storedGlobal: GlobalStreamerSettings = {
      ...DEFAULT_GLOBAL_SETTINGS,
      colors: {
        ...DEFAULT_GLOBAL_SETTINGS.colors,
        mode: "player",
        observerView: {
          eagleColor: "purple",
          cobraColor: "green",
        },
      },
      ticker: {
        ...DEFAULT_GLOBAL_SETTINGS.ticker,
        showTicker: false,
      },
    };
    localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(storedGlobal));

    const { result } = renderHook(() => useStreamerSettings());

    expect(result.current.settings.global.colors.mode).toBe("player");
    expect(result.current.settings.global.colors.observerView.eagleColor).toBe("purple");
    expect(result.current.settings.global.colors.observerView.cobraColor).toBe("green");
    expect(result.current.settings.global.ticker.showTicker).toBe(false);
  });

  it("uses default series settings regardless of localStorage content", () => {
    const storedGlobal: GlobalStreamerSettings = {
      ...DEFAULT_GLOBAL_SETTINGS,
      viewMode: "wide",
    };
    localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(storedGlobal));

    const { result } = renderHook(() => useStreamerSettings());

    expect(result.current.settings.series).toEqual(DEFAULT_ALL_SETTINGS.series);
  });

  it("saves global settings to localStorage when updateGlobalSettings is called", () => {
    const { result } = renderHook(() => useStreamerSettings());

    act(() => {
      result.current.updateGlobalSettings({
        viewMode: "wide",
      });
    });

    const stored = localStorage.getItem(STORAGE_KEY_GLOBAL);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!) as GlobalStreamerSettings;
    expect(parsed.viewMode).toBe("wide");
  });

  it("merges partial updates from updateGlobalSettings with existing settings", () => {
    const storedGlobal: GlobalStreamerSettings = {
      ...DEFAULT_GLOBAL_SETTINGS,
      viewMode: "streamer",
      ticker: {
        ...DEFAULT_GLOBAL_SETTINGS.ticker,
        showTicker: false,
      },
    };
    localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(storedGlobal));

    const { result } = renderHook(() => useStreamerSettings());

    act(() => {
      result.current.updateGlobalSettings({ viewMode: "wide" });
    });

    expect(result.current.settings.global.viewMode).toBe("wide");
    expect(result.current.settings.global.ticker.showTicker).toBe(false);
  });

  it("saves global settings to localStorage when setSettings is called", () => {
    const { result } = renderHook(() => useStreamerSettings());

    act(() => {
      result.current.setSettings({
        ...DEFAULT_ALL_SETTINGS,
        global: {
          ...DEFAULT_GLOBAL_SETTINGS,
          viewMode: "streamer",
        },
      });
    });

    const stored = localStorage.getItem(STORAGE_KEY_GLOBAL);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!) as GlobalStreamerSettings;
    expect(parsed.viewMode).toBe("streamer");
  });

  it("does not save series settings to localStorage when setSettings is called", () => {
    const { result } = renderHook(() => useStreamerSettings());

    act(() => {
      result.current.setSettings({
        ...DEFAULT_ALL_SETTINGS,
        series: {
          titleOverride: "Custom Title",
          subtitleOverride: null,
          eagleTeamNameOverride: null,
          cobraTeamNameOverride: null,
          disableTeamPlayerNames: null,
        },
      });
    });

    // series settings should be in state but NOT in localStorage
    expect(result.current.settings.series.titleOverride).toBe("Custom Title");
    const stored = localStorage.getItem(STORAGE_KEY_GLOBAL);
    if (stored != null) {
      // If something was stored, it should be global settings (without titleOverride)
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      expect(parsed).not.toHaveProperty("titleOverride");
    }
  });

  it("updates series settings without saving them to localStorage via updateSeriesSettings", () => {
    const { result } = renderHook(() => useStreamerSettings());

    act(() => {
      result.current.updateSeriesSettings({ titleOverride: "Series Title" });
    });

    expect(result.current.settings.series.titleOverride).toBe("Series Title");

    const stored = localStorage.getItem(STORAGE_KEY_GLOBAL);
    if (stored != null) {
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      expect(parsed).not.toHaveProperty("titleOverride");
    }
  });

  it("gracefully handles invalid JSON in localStorage", () => {
    localStorage.setItem(STORAGE_KEY_GLOBAL, "not-valid-json");

    const warnSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useStreamerSettings());

    expect(result.current.settings).toEqual(DEFAULT_ALL_SETTINGS);
    warnSpy.mockRestore();
  });

  it("merges partial stored global settings with defaults for missing fields", () => {
    const partialStored = {
      viewMode: "wide",
      // Missing colors, display, ticker, fontSizes
    };
    localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(partialStored));

    const { result } = renderHook(() => useStreamerSettings());

    expect(result.current.settings.global.viewMode).toBe("wide");
    // Missing fields should fall back to defaults
    expect(result.current.settings.global.colors).toEqual(DEFAULT_GLOBAL_SETTINGS.colors);
    expect(result.current.settings.global.display).toEqual(DEFAULT_GLOBAL_SETTINGS.display);
    expect(result.current.settings.global.ticker).toEqual(DEFAULT_GLOBAL_SETTINGS.ticker);
  });
});
