import { useState } from "react";
import type { PreviewMode, StreamerOptions } from "../view-mode/view-mode-selector";

interface StreamerPreferences {
  readonly previewMode: PreviewMode;
  readonly options: StreamerOptions;
}

interface UseStreamerPreferencesResult {
  readonly previewMode: PreviewMode;
  readonly setPreviewMode: (mode: PreviewMode) => void;
  readonly streamerOptions: StreamerOptions;
  readonly setStreamerOptions: (options: StreamerOptions) => void;
}

const STORAGE_KEY = "live-tracker-streamer-preferences";

const DEFAULT_PREFERENCES: StreamerPreferences = {
  previewMode: "none",
  options: {
    showTeams: true,
    showTicker: true,
    showTabs: true,
    showServerName: true,
  },
};

function loadStreamerPreferences(): StreamerPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored != null && stored !== "") {
      return JSON.parse(stored) as StreamerPreferences;
    }
  } catch (error) {
    console.error("Failed to load streamer preferences:", error);
  }
  return DEFAULT_PREFERENCES;
}

function saveStreamerPreferences(preferences: StreamerPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error("Failed to save streamer preferences:", error);
  }
}

export function useStreamerPreferences(): UseStreamerPreferencesResult {
  const [preferences, setPreferences] = useState<StreamerPreferences>(() => loadStreamerPreferences());

  const setPreviewMode = (mode: PreviewMode): void => {
    const updated = { ...preferences, previewMode: mode };
    setPreferences(updated);
    saveStreamerPreferences(updated);
  };

  const setStreamerOptions = (options: StreamerOptions): void => {
    const updated = { ...preferences, options };
    setPreferences(updated);
    saveStreamerPreferences(updated);
  };

  return {
    previewMode: preferences.previewMode,
    setPreviewMode,
    streamerOptions: preferences.options,
    setStreamerOptions,
  };
}
