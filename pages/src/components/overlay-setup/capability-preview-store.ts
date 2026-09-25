import type { CapabilityPreviewData } from "./capability-preview-data";

export interface CapabilityPreviewSnapshot {
  readonly status: "idle" | "loading" | "loaded" | "error";
  readonly data: CapabilityPreviewData;
  readonly errorMessage: string | null;
}

export class CapabilityPreviewStore {
  private snapshot: CapabilityPreviewSnapshot;
  private readonly subscribers = new Set<() => void>();

  public constructor(initialData: CapabilityPreviewData) {
    this.snapshot = { status: "idle", data: initialData, errorMessage: null };
  }

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): CapabilityPreviewSnapshot {
    return this.snapshot;
  }

  public update(snapshot: CapabilityPreviewSnapshot): void {
    this.snapshot = snapshot;
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
