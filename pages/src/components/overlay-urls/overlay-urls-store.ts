export type OverlayUrlsCopyTarget = "idle" | "view" | "overlay";

export interface OverlayUrlsSnapshot {
  readonly copyTarget: OverlayUrlsCopyTarget;
}

export class OverlayUrlsStore {
  private snapshot: OverlayUrlsSnapshot = { copyTarget: "idle" };
  private readonly subscribers = new Set<() => void>();

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): OverlayUrlsSnapshot {
    return this.snapshot;
  }

  public update(snapshot: OverlayUrlsSnapshot): void {
    this.snapshot = snapshot;
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
