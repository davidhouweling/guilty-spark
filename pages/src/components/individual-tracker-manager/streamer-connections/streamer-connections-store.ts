import type {
  IndividualTopBarStatOption,
  StreamerViewColorMode,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { DisplaySettings, FontSizeSettings, TickerSettings } from "../../live-tracker/settings/types";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface StreamerConnectionsSnapshot {
  readonly gamertag: string | null;
  readonly defaultColorMode: StreamerViewColorMode;
  readonly playerTeamColor: string;
  readonly playerEnemyColor: string;
  readonly observerTeamColor: string;
  readonly observerEnemyColor: string;
  readonly displaySettings: DisplaySettings;
  readonly tickerSettings: TickerSettings;
  readonly fontSizeSettings: FontSizeSettings;
  readonly topBarStatSlots: readonly IndividualTopBarStatOption[];
  readonly saveStatus: SaveStatus;
  readonly saveErrorMessage: string | null;
}

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showTeamDetails: false,
  showDiscordNames: true,
  showXboxNames: true,
  showServerIcon: true,
  showTitle: true,
  showSubtitle: true,
  showScore: true,
};

const DEFAULT_TICKER_SETTINGS: TickerSettings = {
  showTicker: true,
  showTabs: true,
  showPreSeriesInfo: true,
  selectedSlayerStats: ["Score", "Kills", "Deaths", "Assists", "KDA", "Damage dealt", "Damage taken", "Damage ratio"],
  showObjectiveStats: false,
  medalRarityFilter: [2, 3],
};

const DEFAULT_FONT_SIZE_SETTINGS: FontSizeSettings = {
  queueInfo: 100,
  score: 100,
  teams: 100,
  tabs: 100,
  ticker: 100,
};

export class StreamerConnectionsStore {
  private snapshot: StreamerConnectionsSnapshot;
  private readonly subscribers = new Set<() => void>();

  public constructor() {
    this.snapshot = {
      gamertag: null,
      defaultColorMode: "player",
      playerTeamColor: "cerulean",
      playerEnemyColor: "salmon",
      observerTeamColor: "salmon",
      observerEnemyColor: "cerulean",
      displaySettings: DEFAULT_DISPLAY_SETTINGS,
      tickerSettings: DEFAULT_TICKER_SETTINGS,
      fontSizeSettings: DEFAULT_FONT_SIZE_SETTINGS,
      topBarStatSlots: [],
      saveStatus: "idle",
      saveErrorMessage: null,
    };
  }

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): StreamerConnectionsSnapshot {
    return this.snapshot;
  }

  public setGamertag(gamertag: string | null): void {
    this.update({ gamertag });
  }

  public batchUpdate(partial: Partial<StreamerConnectionsSnapshot>): void {
    this.update(partial);
  }

  public setDefaultColorMode(defaultColorMode: StreamerViewColorMode): void {
    this.update({ defaultColorMode });
  }

  public setPlayerColors(playerTeamColor: string, playerEnemyColor: string): void {
    this.update({ playerTeamColor, playerEnemyColor });
  }

  public setObserverColors(observerTeamColor: string, observerEnemyColor: string): void {
    this.update({ observerTeamColor, observerEnemyColor });
  }

  public setDisplaySettings(displaySettings: DisplaySettings): void {
    this.update({ displaySettings });
  }

  public setTickerSettings(tickerSettings: TickerSettings): void {
    this.update({ tickerSettings });
  }

  public setFontSizeSettings(fontSizeSettings: FontSizeSettings): void {
    this.update({ fontSizeSettings });
  }

  public setTopBarStatSlots(topBarStatSlots: readonly IndividualTopBarStatOption[]): void {
    this.update({ topBarStatSlots: [...topBarStatSlots] });
  }

  public setSaving(): void {
    this.update({ saveStatus: "saving", saveErrorMessage: null });
  }

  public setSaved(): void {
    this.update({ saveStatus: "saved", saveErrorMessage: null });
  }

  public setSaveError(message: string): void {
    this.update({ saveStatus: "error", saveErrorMessage: message });
  }

  private update(partial: Partial<StreamerConnectionsSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
