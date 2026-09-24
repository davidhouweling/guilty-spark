export type StreamOverlayAuthState = "loading" | "unauthenticated" | "authenticated";

export interface StreamOverlaySnapshot {
  readonly authState: StreamOverlayAuthState;
  readonly gamertag: string | null;
  readonly avatarUrl: string | null;
}

export class StreamOverlayStore {
  private snapshot: StreamOverlaySnapshot = {
    authState: "loading",
    gamertag: null,
    avatarUrl: null,
  };
  private readonly subscribers = new Set<() => void>();

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): StreamOverlaySnapshot {
    return this.snapshot;
  }

  public update(snapshot: StreamOverlaySnapshot): void {
    this.snapshot = snapshot;
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
