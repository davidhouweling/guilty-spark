import type {
  StreamerViewColorMode,
  StreamerViewSettings,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { IndividualTrackerSettingsService } from "../../../services/individual-tracker/settings-types";
import type { DisplaySettings, FontSizeSettings, TickerSettings } from "../../live-tracker/settings/types";
import type { StreamerConnectionsSnapshot, StreamerConnectionsStore } from "./streamer-connections-store";

const DEBOUNCE_MS = 450;

interface Config {
  readonly settingsService: IndividualTrackerSettingsService;
  readonly store: StreamerConnectionsStore;
}

function settingsToSnapshot(
  settings: StreamerViewSettings,
  snapshot: StreamerConnectionsSnapshot,
): Omit<StreamerConnectionsSnapshot, "saveStatus" | "saveErrorMessage" | "gamertag"> {
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
    },
    fontSizeSettings: {
      queueInfo: fontSizes.queueInfo ?? snapshot.fontSizeSettings.queueInfo,
      score: fontSizes.score ?? snapshot.fontSizeSettings.score,
      teams: fontSizes.teams ?? snapshot.fontSizeSettings.teams,
      tabs: fontSizes.tabs ?? snapshot.fontSizeSettings.tabs,
      ticker: fontSizes.ticker ?? snapshot.fontSizeSettings.ticker,
    },
  };
}

function applyParsedSettingsToStore(
  store: StreamerConnectionsStore,
  parsed: Omit<StreamerConnectionsSnapshot, "saveStatus" | "saveErrorMessage" | "gamertag">,
  gamertag: string | null,
): void {
  store.setXuid(gamertag);
  store.setDefaultColorMode(parsed.defaultColorMode);
  store.setPlayerColors(parsed.playerTeamColor, parsed.playerEnemyColor);
  store.setObserverColors(parsed.observerTeamColor, parsed.observerEnemyColor);
  store.setDisplaySettings(parsed.displaySettings);
  store.setTickerSettings(parsed.tickerSettings);
  store.setFontSizeSettings(parsed.fontSizeSettings);
}

function snapshotToSettings(snapshot: StreamerConnectionsSnapshot): StreamerViewSettings {
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

export class StreamerConnectionsPresenter {
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

  public setFontSizes(updates: Partial<FontSizeSettings>): void {
    if (this.isDisposed) {
      return;
    }
    const current = this.config.store.getSnapshot().fontSizeSettings;
    this.config.store.setFontSizeSettings({ ...current, ...updates });
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
    this.config.settingsService
      .updateSettings(settings)
      .then((saved) => {
        if (this.isDisposed || generation !== this.saveGeneration || this.debounceTimer !== null) {
          return;
        }
        const snapshot = this.config.store.getSnapshot();
        const parsed = settingsToSnapshot(saved, snapshot);
        applyParsedSettingsToStore(this.config.store, parsed, snapshot.gamertag);
        this.config.store.setSaved();
      })
      .catch((err: unknown) => {
        if (this.isDisposed || generation !== this.saveGeneration || this.debounceTimer !== null) {
          return;
        }
        const message = err instanceof Error ? err.message : "Failed to save settings";
        this.config.store.setSaveError(message);
      });
  }
}
