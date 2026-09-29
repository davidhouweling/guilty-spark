import type { OverlayPreviewMode } from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type {
  FollowLiveService,
  DirectoryConnection,
  DirectorySubscription,
} from "../../../services/follow/follow-types";
import type { OverlayPreviewService } from "../../../services/individual-tracker/overlay-preview-types";
import { getReconnectDelayMs } from "../../../services/base/reconnect-policy";
import { OVERLAY_SETUP_DEMO_GAMERTAG } from "../overlay-setup-presenter";
import type { CapabilityPreviewSnapshot, CapabilityPreviewStore } from "./capability-preview-store";
import type { CapabilityPreviewOptions, CapabilityPreviewViewModel } from "./types";

interface Config {
  readonly previewService: OverlayPreviewService;
  readonly followLiveService: FollowLiveService;
  readonly store: CapabilityPreviewStore;
}

export class CapabilityPreviewPresenter {
  private readonly config: Config;
  private readonly requestIds = new Map<OverlayPreviewMode, number>();
  private readonly settingsKeys = new Map<OverlayPreviewMode, string>();
  private identityKey: string | undefined;
  private directoryRequestId = 0;
  private directoryGamertag: string | null = null;
  private directoryObserverEnabled = true;
  private directoryConnection: DirectoryConnection | null = null;
  private directorySubscription: DirectorySubscription | null = null;
  private directoryStatusSubscription: DirectorySubscription | null = null;
  private directoryReconnectAttempt = 0;
  private directoryReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isDisposed = false;

  public constructor(config: Config) {
    this.config = config;
  }

  public subscribe = (listener: () => void): (() => void) => this.config.store.subscribe(listener);

  public getSnapshot = (): CapabilityPreviewSnapshot => this.config.store.getSnapshot();

  public onFollowDirectoryChange = (directory: TrackerDirectory): void => {
    if (!this.isDisposed) {
      this.directoryRequestId++;
      this.applyDirectory(directory);
    }
  };

  public selectTab(tab: CapabilityPreviewSnapshot["activeTab"]): void {
    this.config.store.setActiveTab(tab);
  }

  public loadDirectory(gamertag: string): void {
    if (!this.isDisposed && this.directoryGamertag === gamertag) {
      return;
    }
    if (this.directoryGamertag != null && this.directoryGamertag !== gamertag) {
      this.clearDirectory();
    }
    this.isDisposed = false;
    this.directoryGamertag = gamertag;
    this.connectDirectoryObserver();
    void this.loadDirectoryAsync(gamertag);
  }

  public setDirectoryObserverEnabled(enabled: boolean): void {
    if (this.directoryObserverEnabled === enabled) {
      return;
    }
    this.directoryObserverEnabled = enabled;
    if (enabled) {
      this.connectDirectoryObserver();
    } else {
      this.disconnectDirectoryObserver();
    }
  }

  public clearDirectory(): void {
    this.directoryRequestId++;
    this.directoryGamertag = null;
    this.disconnectDirectoryObserver();
    this.config.store.clearDirectory();
  }

  public retryDirectory(): void {
    if (this.directoryGamertag != null) {
      void this.loadDirectoryAsync(this.directoryGamertag);
    }
  }

  public present(snapshot: CapabilityPreviewSnapshot, options: CapabilityPreviewOptions): CapabilityPreviewViewModel {
    const { activeTab, matchmaking, series } = snapshot;
    const sourceState = activeTab === "series" ? series : matchmaking;
    const liveTracker = snapshot.live.directory?.trackers.find(
      (entry) => entry.trackerId === snapshot.live.directory?.liveTrackerId,
    );
    const isExample =
      activeTab === "live"
        ? false
        : sourceState.status === "loaded"
          ? sourceState.data.isExample
          : !options.isAuthenticated;
    const gamertag =
      activeTab === "live"
        ? (liveTracker?.gamertag ?? options.gamertag ?? OVERLAY_SETUP_DEMO_GAMERTAG)
        : sourceState.status === "loaded"
          ? sourceState.data.view.gamertag
          : options.isAuthenticated
            ? (options.gamertag ?? OVERLAY_SETUP_DEMO_GAMERTAG)
            : OVERLAY_SETUP_DEMO_GAMERTAG;
    return {
      activeTab,
      showLiveTab: options.isAuthenticated,
      isTrackerLive: snapshot.live.directory?.trackers.some((entry) => entry.isLive) ?? false,
      source: { isExample, gamertag },
      content:
        activeTab === "live"
          ? this.getLiveContent(snapshot, options)
          : this.getContent(activeTab, matchmaking, series, options),
    };
  }

  private getLiveContent(
    snapshot: CapabilityPreviewSnapshot,
    options: CapabilityPreviewOptions,
  ): CapabilityPreviewViewModel["content"] {
    const { live } = snapshot;
    if (live.status === "idle" || live.status === "loading") {
      return { type: "live-loading" };
    }
    if (live.status === "error") {
      return { type: "live-error", message: live.errorMessage ?? "Failed to load live tracker" };
    }
    const tracker =
      live.directory?.trackers.find((entry) => entry.trackerId === live.directory?.liveTrackerId) ??
      live.directory?.trackers.find((entry) => entry.isLive);
    if (tracker == null) {
      return {
        type: "live-empty",
        isPaused: live.directory?.trackers.some((entry) => entry.status === "paused") ?? false,
      };
    }
    return {
      type: "live-overlay",
      gamertag: options.gamertag ?? tracker.gamertag,
      previewMode: live.directory?.streamerSettings.styleFlags?.colorMode ?? options.previewMode,
    };
  }

  public load(mode: OverlayPreviewMode, previewSettings?: StreamerViewSettings, identityKey?: string): void {
    this.setIdentityKey(identityKey);
    this.loadMode(mode, previewSettings, false);
  }

  public retry(mode: OverlayPreviewMode, previewSettings?: StreamerViewSettings, identityKey?: string): void {
    this.setIdentityKey(identityKey);
    this.loadMode(mode, previewSettings, true);
  }

  public updateSettings(previewSettings?: StreamerViewSettings, identityKey?: string): void {
    this.setIdentityKey(identityKey);
    const snapshot = this.config.store.getSnapshot();
    for (const mode of ["matchmaking", "series"] as const) {
      if (mode === "matchmaking" || snapshot[mode].status !== "idle") {
        this.load(mode, previewSettings);
      }
    }
  }

  private setIdentityKey(identityKey: string | undefined): void {
    if (identityKey !== undefined) {
      this.identityKey = identityKey;
    }
  }

  private loadMode(mode: OverlayPreviewMode, previewSettings: StreamerViewSettings | undefined, force: boolean): void {
    this.isDisposed = false;
    const statsHighlightSlots =
      mode === "matchmaking" ? previewSettings?.visibleSections?.statsHighlightSlots : undefined;
    const settingsKey = JSON.stringify({
      identityKey: this.identityKey,
      statsHighlightSlots: statsHighlightSlots ?? null,
    });
    if (!force && this.settingsKeys.get(mode) === settingsKey) {
      return;
    }
    this.settingsKeys.set(mode, settingsKey);
    const requestId = (this.requestIds.get(mode) ?? 0) + 1;
    this.requestIds.set(mode, requestId);
    this.config.store.setLoading(mode);
    const requestSettings =
      statsHighlightSlots === undefined
        ? undefined
        : { visibleSections: { statsHighlightSlots: [...statsHighlightSlots] } };
    void this.loadAsync(mode, requestId, requestSettings);
  }

  public reload(previewSettings?: StreamerViewSettings): void {
    this.load("matchmaking", previewSettings);
    this.load("series", previewSettings);
  }

  public dispose(): void {
    this.isDisposed = true;
    this.directoryRequestId++;
    this.directoryGamertag = null;
    this.disconnectDirectoryObserver();
    this.identityKey = undefined;
    this.settingsKeys.clear();
    for (const mode of ["matchmaking", "series"] as const) {
      this.requestIds.set(mode, (this.requestIds.get(mode) ?? 0) + 1);
    }
  }

  private async loadDirectoryAsync(gamertag: string): Promise<void> {
    const requestId = ++this.directoryRequestId;
    this.config.store.setDirectoryLoading();
    try {
      const directory = await this.config.followLiveService.getDirectory(gamertag);
      if (this.isDisposed || requestId !== this.directoryRequestId) {
        return;
      }
      this.applyDirectory(directory);
    } catch (error) {
      if (!this.isDisposed && requestId === this.directoryRequestId) {
        this.config.store.setDirectoryError(error instanceof Error ? error.message : "Failed to load live tracker");
      }
    }
  }

  private connectDirectoryObserver(): void {
    if (
      this.isDisposed ||
      !this.directoryObserverEnabled ||
      this.directoryGamertag == null ||
      this.directoryConnection != null
    ) {
      return;
    }

    const connection = this.config.followLiveService.connectDirectory(this.directoryGamertag);
    this.directoryConnection = connection;
    this.directorySubscription = connection.subscribe((directory) => {
      if (this.directoryConnection === connection) {
        this.onFollowDirectoryChange(directory);
      }
    });
    this.directoryStatusSubscription = connection.subscribeStatus((status) => {
      if (this.directoryConnection !== connection) {
        return;
      }
      if (status === "connected") {
        this.directoryReconnectAttempt = 0;
        this.clearDirectoryReconnectTimer();
      } else if (status === "error" || status === "disconnected") {
        this.scheduleDirectoryReconnect();
      }
    });
  }

  private disconnectDirectoryObserver(resetReconnectAttempt = true): void {
    this.clearDirectoryReconnectTimer();
    this.directorySubscription?.unsubscribe();
    this.directoryStatusSubscription?.unsubscribe();
    this.directoryConnection?.disconnect();
    this.directorySubscription = null;
    this.directoryStatusSubscription = null;
    this.directoryConnection = null;
    if (resetReconnectAttempt) {
      this.directoryReconnectAttempt = 0;
    }
  }

  private scheduleDirectoryReconnect(): void {
    if (this.directoryReconnectTimer != null || this.directoryGamertag == null) {
      return;
    }
    const delay = getReconnectDelayMs(this.directoryReconnectAttempt);
    this.directoryReconnectAttempt++;
    this.directoryReconnectTimer = setTimeout(() => {
      this.directoryReconnectTimer = null;
      this.disconnectDirectoryObserver(false);
      this.connectDirectoryObserver();
    }, delay);
  }

  private clearDirectoryReconnectTimer(): void {
    if (this.directoryReconnectTimer != null) {
      clearTimeout(this.directoryReconnectTimer);
      this.directoryReconnectTimer = null;
    }
  }

  private applyDirectory(directory: TrackerDirectory): void {
    this.config.store.selectLiveOnInitialLoad(directory.trackers.some((tracker) => tracker.isLive));
    this.config.store.setDirectory(directory);
  }

  private getContent(
    activeTab: CapabilityPreviewSnapshot["activeTab"],
    matchmaking: CapabilityPreviewSnapshot["matchmaking"],
    series: CapabilityPreviewSnapshot["series"],
    options: CapabilityPreviewOptions,
  ): CapabilityPreviewViewModel["content"] {
    const mode = activeTab === "series" ? "series" : "matchmaking";
    const state = mode === "series" ? series : matchmaking;
    if (state.status === "idle" || state.status === "loading") {
      return { type: "loading" };
    }
    if (state.status === "error") {
      return { type: "error", mode, message: state.errorMessage };
    }

    const { view } = state.data;
    if (activeTab === "series" && (!view.hasActiveSeries || view.series.length === 0)) {
      return { type: "empty-series" };
    }

    const previewView =
      options.streamerSettings === undefined ? view : { ...view, streamerSettings: options.streamerSettings };
    if (activeTab === "viewer") {
      return { type: "viewer", trackerId: view.trackerId, view: previewView };
    }
    return {
      type: "overlay",
      mode,
      trackerId: view.trackerId,
      view: previewView,
      previewMode: options.previewMode,
    };
  }

  private async loadAsync(
    mode: OverlayPreviewMode,
    requestId: number,
    previewSettings: StreamerViewSettings | undefined,
  ): Promise<void> {
    try {
      const response = await this.config.previewService.getPreview(mode, previewSettings);
      if (this.isStale(mode, requestId)) {
        return;
      }
      this.config.store.setLoaded(mode, response);
    } catch (error) {
      if (this.isStale(mode, requestId)) {
        return;
      }
      this.config.store.setError(mode, error instanceof Error ? error.message : "Failed to load overlay preview");
    }
  }

  private isStale(mode: OverlayPreviewMode, requestId: number): boolean {
    return this.isDisposed || this.requestIds.get(mode) !== requestId;
  }
}
