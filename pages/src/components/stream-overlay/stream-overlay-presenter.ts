import type { AuthService } from "../../services/auth/types";
import type { StreamOverlaySnapshot, StreamOverlayStore } from "./stream-overlay-store";

// Shown to logged-out visitors so Steps 2 & 3 render with realistic sample data.
export const STREAM_OVERLAY_DEMO_GAMERTAG = "SampleSpartan";

interface Config {
  readonly authService: AuthService;
  readonly store: StreamOverlayStore;
}

export class StreamOverlayPresenter {
  private readonly config: Config;
  private loadSeq = 0;

  public constructor(config: Config) {
    this.config = config;
  }

  public start(): void {
    const seq = ++this.loadSeq;
    void this.load(seq);
  }

  public dispose(): void {
    ++this.loadSeq;
  }

  public subscribe(listener: () => void): () => void {
    this.config.store.subscribers.add(listener);
    return (): void => {
      this.config.store.subscribers.delete(listener);
    };
  }

  public getSnapshot(): StreamOverlaySnapshot {
    return this.config.store.snapshot;
  }

  private async load(seq: number): Promise<void> {
    try {
      const session = await this.config.authService.getSession();

      if (seq !== this.loadSeq) {
        return;
      }

      if (!session.authenticated) {
        this.applySnapshot(() => ({
          authState: "unauthenticated",
          gamertag: STREAM_OVERLAY_DEMO_GAMERTAG,
          avatarUrl: null,
        }));
        return;
      }

      this.applySnapshot(() => ({
        authState: "authenticated",
        gamertag: session.xboxGamertag ?? null,
        avatarUrl: session.avatarUrl ?? null,
      }));
    } catch {
      if (seq !== this.loadSeq) {
        return;
      }
      this.applySnapshot(() => ({
        authState: "unauthenticated",
        gamertag: STREAM_OVERLAY_DEMO_GAMERTAG,
        avatarUrl: null,
      }));
    }
  }

  private applySnapshot(updater: (s: StreamOverlaySnapshot) => StreamOverlaySnapshot): void {
    this.config.store.snapshot = updater(this.config.store.snapshot);
    for (const listener of this.config.store.subscribers) {
      listener();
    }
  }
}
