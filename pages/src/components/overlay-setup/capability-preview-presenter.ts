import type { OverlayPreviewMode } from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type { IndividualStatsHighlightOption } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { OverlayPreviewService } from "../../services/individual-tracker/overlay-preview-types";
import type { CapabilityPreviewStore } from "./capability-preview-store";

interface Config {
  readonly previewService: OverlayPreviewService;
  readonly store: CapabilityPreviewStore;
}

export class CapabilityPreviewPresenter {
  private readonly config: Config;
  private readonly requestIds = new Map<OverlayPreviewMode, number>();
  private isDisposed = false;

  public constructor(config: Config) {
    this.config = config;
  }

  public load(mode: OverlayPreviewMode, statsHighlightSlots?: readonly IndividualStatsHighlightOption[]): void {
    this.isDisposed = false;
    const requestId = (this.requestIds.get(mode) ?? 0) + 1;
    this.requestIds.set(mode, requestId);
    this.config.store.setLoading(mode);
    void this.loadAsync(mode, requestId, statsHighlightSlots);
  }

  public reload(statsHighlightSlots?: readonly IndividualStatsHighlightOption[]): void {
    this.load("matchmaking", statsHighlightSlots);
    this.load("series", statsHighlightSlots);
  }

  public dispose(): void {
    this.isDisposed = true;
    for (const mode of ["matchmaking", "series"] as const) {
      this.requestIds.set(mode, (this.requestIds.get(mode) ?? 0) + 1);
    }
  }

  private async loadAsync(
    mode: OverlayPreviewMode,
    requestId: number,
    statsHighlightSlots: readonly IndividualStatsHighlightOption[] | undefined,
  ): Promise<void> {
    try {
      const response = await this.config.previewService.getPreview(mode, statsHighlightSlots);
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
