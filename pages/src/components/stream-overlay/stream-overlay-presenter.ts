import type { AuthService } from "../../services/auth/types";
import type { StreamOverlaySnapshot, StreamOverlayStore } from "./stream-overlay-store";

// Shown to logged-out visitors so Steps 2 & 3 render with realistic sample data.
export const STREAM_OVERLAY_DEMO_GAMERTAG = "343GuiltySpark";

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
    return this.config.store.subscribe(listener);
  }

  public getSnapshot(): StreamOverlaySnapshot {
    return this.config.store.getSnapshot();
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
          errorMessage: null,
        }));
        return;
      }

      this.applySnapshot(() => ({
        authState: "authenticated",
        gamertag: session.xboxGamertag ?? null,
        avatarUrl: session.avatarUrl ?? null,
        errorMessage: null,
      }));
    } catch {
      if (seq !== this.loadSeq) {
        return;
      }
      this.applySnapshot(() => ({
        authState: "error",
        gamertag: null,
        avatarUrl: null,
        errorMessage: "Failed to load session. Please refresh the page.",
      }));
    }
  }

  private applySnapshot(updater: (s: StreamOverlaySnapshot) => StreamOverlaySnapshot): void {
    this.config.store.update(updater(this.config.store.getSnapshot()));
  }
}
