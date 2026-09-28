import type {
  OverlayPreviewMode,
  OverlayPreviewResponse,
} from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type { CapabilityPreviewTab } from "./types";

export type CapabilityPreviewModeSnapshot =
  | { readonly status: "idle"; readonly data: null; readonly errorMessage: null }
  | { readonly status: "loading"; readonly data: null; readonly errorMessage: null }
  | { readonly status: "loaded"; readonly data: OverlayPreviewResponse; readonly errorMessage: null }
  | { readonly status: "error"; readonly data: null; readonly errorMessage: string };

export interface CapabilityPreviewSnapshot {
  readonly activeTab: CapabilityPreviewTab;
  readonly matchmaking: CapabilityPreviewModeSnapshot;
  readonly series: CapabilityPreviewModeSnapshot;
}

const IDLE_MODE: CapabilityPreviewModeSnapshot = { status: "idle", data: null, errorMessage: null };

export class CapabilityPreviewStore {
  private snapshot: CapabilityPreviewSnapshot;
  private readonly subscribers = new Set<() => void>();

  public constructor(activeTab: CapabilityPreviewTab = "matchmaking") {
    this.snapshot = {
      activeTab,
      matchmaking: IDLE_MODE,
      series: IDLE_MODE,
    };
  }

  public getSnapshot = (): CapabilityPreviewSnapshot => this.snapshot;

  public subscribe = (listener: () => void): (() => void) => {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  };

  public setLoading(mode: OverlayPreviewMode): void {
    this.update({ [mode]: { status: "loading", data: null, errorMessage: null } });
  }

  public setActiveTab(activeTab: CapabilityPreviewTab): void {
    if (this.snapshot.activeTab === activeTab) {
      return;
    }
    this.update({ activeTab });
  }

  public setLoaded(mode: OverlayPreviewMode, response: OverlayPreviewResponse): void {
    this.update({ [mode]: { status: "loaded", data: response, errorMessage: null } });
  }

  public setError(mode: OverlayPreviewMode, errorMessage: string): void {
    this.update({ [mode]: { status: "error", data: null, errorMessage } });
  }

  private update(patch: Partial<CapabilityPreviewSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
