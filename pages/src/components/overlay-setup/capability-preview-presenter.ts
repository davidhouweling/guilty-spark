import type { OverlayPreviewMode } from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { OverlayPreviewService } from "../../services/individual-tracker/overlay-preview-types";
import type { CapabilityPreviewStore } from "./capability-preview-store";

interface Config {
  readonly previewService: OverlayPreviewService;
  readonly store: CapabilityPreviewStore;
}

export class CapabilityPreviewPresenter {
  private readonly config: Config;
  private readonly requestIds = new Map<OverlayPreviewMode, number>();
  private readonly settingsKeys = new Map<OverlayPreviewMode, string>();
  private isDisposed = false;

  public constructor(config: Config) {
    this.config = config;
  }

  public load(mode: OverlayPreviewMode, previewSettings?: StreamerViewSettings): void {
    this.loadMode(mode, previewSettings, false);
  }

  public retry(mode: OverlayPreviewMode, previewSettings?: StreamerViewSettings): void {
    this.loadMode(mode, previewSettings, true);
  }

  public updateSettings(previewSettings?: StreamerViewSettings): void {
    const snapshot = this.config.store.getSnapshot();
    for (const mode of ["matchmaking", "series"] as const) {
      if (mode === "matchmaking" || snapshot[mode].status !== "idle") {
        this.load(mode, previewSettings);
      }
    }
  }

  private loadMode(mode: OverlayPreviewMode, previewSettings: StreamerViewSettings | undefined, force: boolean): void {
    this.isDisposed = false;
    const settingsKey = JSON.stringify(previewSettings ?? null);
    if (!force && this.settingsKeys.get(mode) === settingsKey) {
      return;
    }
    this.settingsKeys.set(mode, settingsKey);
    const requestId = (this.requestIds.get(mode) ?? 0) + 1;
    this.requestIds.set(mode, requestId);
    this.config.store.setLoading(mode);
    void this.loadAsync(mode, requestId, previewSettings);
  }

  public reload(previewSettings?: StreamerViewSettings): void {
    this.load("matchmaking", previewSettings);
    this.load("series", previewSettings);
  }

  public dispose(): void {
    this.isDisposed = true;
    this.settingsKeys.clear();
    for (const mode of ["matchmaking", "series"] as const) {
      this.requestIds.set(mode, (this.requestIds.get(mode) ?? 0) + 1);
    }
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
