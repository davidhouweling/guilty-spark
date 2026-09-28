import type { OverlayPreviewMode } from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { OverlayPreviewService } from "../../../services/individual-tracker/overlay-preview-types";
import { OVERLAY_SETUP_DEMO_GAMERTAG } from "../overlay-setup-presenter";
import type { CapabilityPreviewSnapshot, CapabilityPreviewStore } from "./capability-preview-store";
import type { CapabilityPreviewOptions, CapabilityPreviewViewModel } from "./types";

interface Config {
  readonly previewService: OverlayPreviewService;
  readonly store: CapabilityPreviewStore;
}

export class CapabilityPreviewPresenter {
  private readonly config: Config;
  private readonly requestIds = new Map<OverlayPreviewMode, number>();
  private readonly settingsKeys = new Map<OverlayPreviewMode, string>();
  private identityKey: string | undefined;
  private isDisposed = false;

  public constructor(config: Config) {
    this.config = config;
  }

  public subscribe = (listener: () => void): (() => void) => this.config.store.subscribe(listener);

  public getSnapshot = (): CapabilityPreviewSnapshot => this.config.store.getSnapshot();

  public selectTab(tab: CapabilityPreviewSnapshot["activeTab"]): void {
    this.config.store.setActiveTab(tab);
  }

  public present(snapshot: CapabilityPreviewSnapshot, options: CapabilityPreviewOptions): CapabilityPreviewViewModel {
    const { activeTab, matchmaking, series } = snapshot;
    const sourceState = activeTab === "series" ? series : matchmaking;
    const isExample = sourceState.status === "loaded" ? sourceState.data.isExample : !options.isAuthenticated;
    const gamertag =
      sourceState.status === "loaded"
        ? sourceState.data.view.gamertag
        : options.isAuthenticated
          ? (options.gamertag ?? OVERLAY_SETUP_DEMO_GAMERTAG)
          : OVERLAY_SETUP_DEMO_GAMERTAG;

    return {
      activeTab,
      source: { isExample, gamertag },
      content: this.getContent(activeTab, matchmaking, series, options),
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
    this.identityKey = undefined;
    this.settingsKeys.clear();
    for (const mode of ["matchmaking", "series"] as const) {
      this.requestIds.set(mode, (this.requestIds.get(mode) ?? 0) + 1);
    }
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
