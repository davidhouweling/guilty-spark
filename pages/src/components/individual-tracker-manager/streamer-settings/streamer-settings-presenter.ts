import type {
  IndividualStatsHighlightOption,
  StreamerViewColorMode,
  StreamerViewSettings,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import {
  INDIVIDUAL_STATS_HIGHLIGHTS_MAX_SLOT_COUNT,
  INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTIONS,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { IndividualTrackerSettingsService } from "../../../services/individual-tracker/settings-types";
import type { DisplaySettings, FontSizeSettings, TickerSettings } from "../../live-tracker/settings/types";
import type { StreamerSettingsSnapshot, StreamerSettingsStore } from "./streamer-settings-store";

const DEBOUNCE_MS = 450;

interface Config {
  readonly settingsService: IndividualTrackerSettingsService;
  readonly store: StreamerSettingsStore;
}

const individualStatsHighlightOptionSet = new Set<string>(INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTIONS);

function isIndividualStatsHighlightOption(value: string): value is IndividualStatsHighlightOption {
  return individualStatsHighlightOptionSet.has(value);
}

function normalizeStatsHighlightSlots(
  statsHighlightSlots: readonly string[] | undefined,
): readonly IndividualStatsHighlightOption[] {
  if (statsHighlightSlots == null) {
    return [];
  }

  return statsHighlightSlots
    .filter(isIndividualStatsHighlightOption)
    .slice(0, INDIVIDUAL_STATS_HIGHLIGHTS_MAX_SLOT_COUNT);
}

function settingsToSnapshot(
  settings: StreamerViewSettings,
  snapshot: StreamerSettingsSnapshot,
): Omit<StreamerSettingsSnapshot, "saveStatus" | "saveErrorMessage" | "gamertag"> {
  const styleFlags = settings.styleFlags ?? {};
  const visibleSections = settings.visibleSections ?? {};
  const fontSizes = settings.layoutOptions?.fontSizes ?? {};

  return {
    defaultColorMode: styleFlags.colorMode ?? snapshot.defaultColorMode,
    playerTeamColor: styleFlags.playerTeamColor ?? snapshot.playerTeamColor,
    playerEnemyColor: styleFlags.playerEnemyColor ?? snapshot.playerEnemyColor,
    observerTeamColor: styleFlags.observerTeamColor ?? snapshot.observerTeamColor,
    observerEnemyColor: styleFlags.observerEnemyColor ?? snapshot.observerEnemyColor,
    displaySettings: {
      showTeamDetails: visibleSections.showTeamDetails ?? snapshot.displaySettings.showTeamDetails,
      showDiscordNames: visibleSections.showDiscordNames ?? snapshot.displaySettings.showDiscordNames,
      showXboxNames: visibleSections.showXboxNames ?? snapshot.displaySettings.showXboxNames,
      showServerIcon: visibleSections.showServerIcon ?? snapshot.displaySettings.showServerIcon,
      showTitle: visibleSections.showTitle ?? snapshot.displaySettings.showTitle,
      showSubtitle: visibleSections.showSubtitle ?? snapshot.displaySettings.showSubtitle,
      showScore: visibleSections.showScore ?? snapshot.displaySettings.showScore,
    },
    tickerSettings: {
      showTicker: visibleSections.showTicker ?? snapshot.tickerSettings.showTicker,
      showTabs: visibleSections.showTabs ?? snapshot.tickerSettings.showTabs,
      showPreSeriesInfo: styleFlags.showPreSeriesInfo ?? snapshot.tickerSettings.showPreSeriesInfo,
      selectedSlayerStats: styleFlags.selectedSlayerStats ?? snapshot.tickerSettings.selectedSlayerStats,
      showObjectiveStats: styleFlags.showObjectiveStats ?? snapshot.tickerSettings.showObjectiveStats,
      medalRarityFilter: styleFlags.medalRarityFilter ?? snapshot.tickerSettings.medalRarityFilter,
      maxPreviousGamesToShow: visibleSections.maxPreviousGamesToShow ?? snapshot.tickerSettings.maxPreviousGamesToShow,
    },
    inSeriesShowSeriesTab: styleFlags.inSeriesShowSeriesTab ?? snapshot.inSeriesShowSeriesTab,
    matchmakingShowSummaryTab: styleFlags.matchmakingShowSummaryTab ?? snapshot.matchmakingShowSummaryTab,
    inSeriesShowTabs: styleFlags.inSeriesShowTabs ?? visibleSections.showTabs ?? snapshot.inSeriesShowTabs,
    matchmakingShowTabs: styleFlags.matchmakingShowTabs ?? visibleSections.showTabs ?? snapshot.matchmakingShowTabs,
    disableTeamPlayerNames: styleFlags.disableTeamPlayerNames ?? snapshot.disableTeamPlayerNames,
    inSeriesShowTicker: styleFlags.inSeriesShowTicker ?? visibleSections.showTicker ?? snapshot.inSeriesShowTicker,
    matchmakingShowTicker:
      styleFlags.matchmakingShowTicker ?? visibleSections.showTicker ?? snapshot.matchmakingShowTicker,
    matchmakingShowStatsHighlights:
      styleFlags.matchmakingShowStatsHighlights ?? snapshot.matchmakingShowStatsHighlights,
    inSeriesMyStatsOnly: styleFlags.inSeriesMyStatsOnly ?? snapshot.inSeriesMyStatsOnly,
    matchmakingMyStatsOnly: styleFlags.matchmakingMyStatsOnly ?? snapshot.matchmakingMyStatsOnly,
    fontSizeSettings: {
      queueInfo: fontSizes.queueInfo ?? snapshot.fontSizeSettings.queueInfo,
      score: fontSizes.score ?? snapshot.fontSizeSettings.score,
      teams: fontSizes.teams ?? snapshot.fontSizeSettings.teams,
      tabs: fontSizes.tabs ?? snapshot.fontSizeSettings.tabs,
      ticker: fontSizes.ticker ?? snapshot.fontSizeSettings.ticker,
    },
    statsHighlightSlots: [
      ...normalizeStatsHighlightSlots(visibleSections.statsHighlightSlots ?? snapshot.statsHighlightSlots),
    ],
  };
}

function applyParsedSettingsToStore(
  store: StreamerSettingsStore,
  parsed: Omit<StreamerSettingsSnapshot, "saveStatus" | "saveErrorMessage" | "gamertag">,
  gamertag: string | null,
): void {
  store.batchUpdate({ gamertag, ...parsed });
}

function snapshotToSettings(snapshot: StreamerSettingsSnapshot): StreamerViewSettings {
  return {
    styleFlags: {
      colorMode: snapshot.defaultColorMode,
      playerTeamColor: snapshot.playerTeamColor,
      playerEnemyColor: snapshot.playerEnemyColor,
      observerTeamColor: snapshot.observerTeamColor,
      observerEnemyColor: snapshot.observerEnemyColor,
      showPreSeriesInfo: snapshot.tickerSettings.showPreSeriesInfo,
      selectedSlayerStats: [...snapshot.tickerSettings.selectedSlayerStats],
      showObjectiveStats: snapshot.tickerSettings.showObjectiveStats,
      medalRarityFilter: [...snapshot.tickerSettings.medalRarityFilter],
      inSeriesShowSeriesTab: snapshot.inSeriesShowSeriesTab,
      matchmakingShowSummaryTab: snapshot.matchmakingShowSummaryTab,
      inSeriesShowTabs: snapshot.inSeriesShowTabs,
      matchmakingShowTabs: snapshot.matchmakingShowTabs,
      disableTeamPlayerNames: snapshot.disableTeamPlayerNames,
      inSeriesShowTicker: snapshot.inSeriesShowTicker,
      matchmakingShowTicker: snapshot.matchmakingShowTicker,
      matchmakingShowStatsHighlights: snapshot.matchmakingShowStatsHighlights,
      inSeriesMyStatsOnly: snapshot.inSeriesMyStatsOnly,
      matchmakingMyStatsOnly: snapshot.matchmakingMyStatsOnly,
    },
    visibleSections: {
      showTeamDetails: snapshot.displaySettings.showTeamDetails,
      showDiscordNames: snapshot.displaySettings.showDiscordNames,
      showXboxNames: snapshot.displaySettings.showXboxNames,
      showServerIcon: snapshot.displaySettings.showServerIcon,
      showTitle: snapshot.displaySettings.showTitle,
      showSubtitle: snapshot.displaySettings.showSubtitle,
      showScore: snapshot.displaySettings.showScore,
      showTicker: snapshot.tickerSettings.showTicker,
      showTabs: snapshot.tickerSettings.showTabs,
      maxPreviousGamesToShow: snapshot.tickerSettings.maxPreviousGamesToShow,
      statsHighlightSlots: [...snapshot.statsHighlightSlots],
    },
    layoutOptions: {
      fontSizes: {
        queueInfo: snapshot.fontSizeSettings.queueInfo,
        score: snapshot.fontSizeSettings.score,
        teams: snapshot.fontSizeSettings.teams,
        tabs: snapshot.fontSizeSettings.tabs,
        ticker: snapshot.fontSizeSettings.ticker,
      },
    },
  };
}

export class StreamerSettingsPresenter {
  private readonly config: Config;
  private isDisposed = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private saveGeneration = 0;

  public constructor(config: Config) {
    this.config = config;
  }

  public dispose(): void {
    this.isDisposed = true;
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  public loadSettings(settings: StreamerViewSettings, gamertag: string | null): void {
    if (this.isDisposed) {
      return;
    }
    if (this.debounceTimer !== null) {
      this.config.store.setGamertag(gamertag);
      return;
    }
    const snapshot = this.config.store.getSnapshot();
    const parsed = settingsToSnapshot(settings, snapshot);
    applyParsedSettingsToStore(this.config.store, parsed, gamertag);
  }

  public setDefaultColorMode(mode: StreamerViewColorMode): void {
    if (this.isDisposed) {
      return;
    }
    this.config.store.setDefaultColorMode(mode);
    this.scheduleSave();
  }

  public setPlayerColors(teamColor: string, enemyColor: string): void {
    if (this.isDisposed) {
      return;
    }
    this.config.store.setPlayerColors(teamColor, enemyColor);
    this.scheduleSave();
  }

  public setObserverColors(teamColor: string, enemyColor: string): void {
    if (this.isDisposed) {
      return;
    }
    this.config.store.setObserverColors(teamColor, enemyColor);
    this.scheduleSave();
  }

  public setDisplaySettings(updates: Partial<DisplaySettings>): void {
    if (this.isDisposed) {
      return;
    }
    const current = this.config.store.getSnapshot().displaySettings;
    this.config.store.setDisplaySettings({ ...current, ...updates });
    this.scheduleSave();
  }

  public setTickerSettings(updates: Partial<TickerSettings>): void {
    if (this.isDisposed) {
      return;
    }
    const current = this.config.store.getSnapshot().tickerSettings;
    this.config.store.setTickerSettings({ ...current, ...updates });
    this.scheduleSave();
  }

  public setInSeriesShowSeriesTab(enabled: boolean): void {
    if (this.isDisposed) {
      return;
    }

    this.config.store.batchUpdate({ inSeriesShowSeriesTab: enabled });
    this.scheduleSave();
  }

  public setMatchmakingShowSummaryTab(enabled: boolean): void {
    if (this.isDisposed) {
      return;
    }

    this.config.store.batchUpdate({ matchmakingShowSummaryTab: enabled });
    this.scheduleSave();
  }

  public setInSeriesShowTabs(enabled: boolean): void {
    if (this.isDisposed) {
      return;
    }

    this.config.store.batchUpdate({ inSeriesShowTabs: enabled });
    this.scheduleSave();
  }

  public setMatchmakingShowTabs(enabled: boolean): void {
    if (this.isDisposed) {
      return;
    }

    this.config.store.batchUpdate({ matchmakingShowTabs: enabled });
    this.scheduleSave();
  }

  public setDisableTeamPlayerNames(enabled: boolean): void {
    if (this.isDisposed) {
      return;
    }

    this.config.store.batchUpdate({ disableTeamPlayerNames: enabled });
    this.scheduleSave();
  }

  public setInSeriesMyStatsOnly(enabled: boolean): void {
    if (this.isDisposed) {
      return;
    }

    this.config.store.batchUpdate({ inSeriesMyStatsOnly: enabled });
    this.scheduleSave();
  }

  public setMatchmakingMyStatsOnly(enabled: boolean): void {
    if (this.isDisposed) {
      return;
    }

    this.config.store.batchUpdate({ matchmakingMyStatsOnly: enabled });
    this.scheduleSave();
  }

  public setInSeriesShowTicker(enabled: boolean): void {
    if (this.isDisposed) {
      return;
    }

    this.config.store.batchUpdate({ inSeriesShowTicker: enabled });
    this.scheduleSave();
  }

  public setMatchmakingShowTicker(enabled: boolean): void {
    if (this.isDisposed) {
      return;
    }

    this.config.store.batchUpdate({ matchmakingShowTicker: enabled });
    this.scheduleSave();
  }

  public setMatchmakingShowStatsHighlights(enabled: boolean): void {
    if (this.isDisposed) {
      return;
    }

    this.config.store.batchUpdate({ matchmakingShowStatsHighlights: enabled });
    this.scheduleSave();
  }

  public setFontSizes(updates: Partial<FontSizeSettings>): void {
    if (this.isDisposed) {
      return;
    }
    const current = this.config.store.getSnapshot().fontSizeSettings;
    this.config.store.setFontSizeSettings({ ...current, ...updates });
    this.scheduleSave();
  }

  public setStatsHighlightSlots(statsHighlightSlots: readonly IndividualStatsHighlightOption[]): void {
    if (this.isDisposed) {
      return;
    }

    this.config.store.setStatsHighlightSlots(normalizeStatsHighlightSlots(statsHighlightSlots));
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.save();
    }, DEBOUNCE_MS);
  }

  private save(): void {
    if (this.isDisposed) {
      return;
    }
    const generation = ++this.saveGeneration;
    const settings = snapshotToSettings(this.config.store.getSnapshot());
    this.config.store.setSaving();
    void this.saveAsync(generation, settings);
  }

  private async saveAsync(generation: number, settings: StreamerViewSettings): Promise<void> {
    try {
      const saved = await this.config.settingsService.updateSettings(settings);
      if (this.isDisposed || generation !== this.saveGeneration || this.debounceTimer !== null) {
        return;
      }
      const snapshot = this.config.store.getSnapshot();
      const parsed = settingsToSnapshot(saved, snapshot);
      applyParsedSettingsToStore(this.config.store, parsed, snapshot.gamertag);
      this.config.store.setSaved();
    } catch (err: unknown) {
      if (this.isDisposed || generation !== this.saveGeneration || this.debounceTimer !== null) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to save settings";
      this.config.store.setSaveError(message);
    }
  }
}
