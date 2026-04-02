import { useState, useCallback } from "react";
import type { AllStreamerSettings, GlobalStreamerSettings, SeriesStreamerSettings } from "./types";
import { DEFAULT_ALL_SETTINGS } from "./types";

const STORAGE_KEY_GLOBAL = "live-tracker-streamer-settings-global";

interface UseStreamerSettingsResult {
  readonly settings: AllStreamerSettings;
  readonly updateGlobalSettings: (settings: Partial<GlobalStreamerSettings>) => void;
  readonly updateSeriesSettings: (settings: Partial<SeriesStreamerSettings>) => void;
  readonly setSettings: (settings: AllStreamerSettings) => void;
}

function loadGlobalSettings(): GlobalStreamerSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_GLOBAL);
    if (stored != null && stored !== "") {
      const parsed = JSON.parse(stored) as Partial<GlobalStreamerSettings>;
      return {
        ...DEFAULT_ALL_SETTINGS.global,
        viewMode: parsed.viewMode ?? DEFAULT_ALL_SETTINGS.global.viewMode,
        ...(parsed.fontSizes && {
          fontSizes: {
            ...DEFAULT_ALL_SETTINGS.global.fontSizes,
            ...parsed.fontSizes,
          },
        }),
        colors: {
          ...DEFAULT_ALL_SETTINGS.global.colors,
          ...(parsed.colors && { mode: parsed.colors.mode }),
          playerView: {
            ...DEFAULT_ALL_SETTINGS.global.colors.playerView,
            ...parsed.colors?.playerView,
          },
          observerView: {
            ...DEFAULT_ALL_SETTINGS.global.colors.observerView,
            ...parsed.colors?.observerView,
          },
        },
        ...(parsed.display && {
          display: {
            ...DEFAULT_ALL_SETTINGS.global.display,
            ...parsed.display,
          },
        }),
        ...(parsed.ticker && {
          ticker: {
            ...DEFAULT_ALL_SETTINGS.global.ticker,
            ...parsed.ticker,
          },
        }),
      };
    }
  } catch (error) {
    console.error("Failed to load global streamer settings:", error);
  }
  return DEFAULT_ALL_SETTINGS.global;
}

function saveGlobalSettings(settings: GlobalStreamerSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save global streamer settings:", error);
  }
}

export function useStreamerSettings(): UseStreamerSettingsResult {
  const [settings, setSettingsState] = useState<AllStreamerSettings>(() => ({
    global: loadGlobalSettings(),
    series: DEFAULT_ALL_SETTINGS.series,
  }));

  const updateGlobalSettings = useCallback((updates: Partial<GlobalStreamerSettings>): void => {
    setSettingsState((prev) => {
      const newGlobal = {
        ...prev.global,
        ...updates,
      };
      saveGlobalSettings(newGlobal);
      return {
        ...prev,
        global: newGlobal,
      };
    });
  }, []);

  const updateSeriesSettings = useCallback((updates: Partial<SeriesStreamerSettings>): void => {
    setSettingsState((prev) => ({
      ...prev,
      series: {
        ...prev.series,
        ...updates,
      },
    }));
  }, []);

  const setSettings = useCallback((newSettings: AllStreamerSettings): void => {
    saveGlobalSettings(newSettings.global);
    setSettingsState(newSettings);
  }, []);

  return {
    settings,
    updateGlobalSettings,
    updateSeriesSettings,
    setSettings,
  };
}
