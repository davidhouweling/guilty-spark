export type OverlaySetupAuthState = "loading" | "unauthenticated" | "authenticated" | "error";

export interface OverlaySetupSnapshot {
  readonly authState: OverlaySetupAuthState;
  readonly gamertag: string | null;
  readonly xuid: string | null;
  readonly avatarUrl: string | null;
  readonly errorMessage: string | null;
}

export class OverlaySetupStore {
  private snapshot: OverlaySetupSnapshot = {
    authState: "loading",
    gamertag: null,
    xuid: null,
    avatarUrl: null,
    errorMessage: null,
  };
  private readonly subscribers = new Set<() => void>();

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): OverlaySetupSnapshot {
    return this.snapshot;
  }

  public update(snapshot: OverlaySetupSnapshot): void {
    this.snapshot = snapshot;
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
