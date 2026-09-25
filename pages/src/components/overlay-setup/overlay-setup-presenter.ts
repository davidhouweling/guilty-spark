import type { AuthService } from "../../services/auth/types";
import type { OverlaySetupSnapshot, OverlaySetupStore } from "./overlay-setup-store";

// Shown to logged-out visitors so Steps 2 & 3 render with realistic sample data.
export const OVERLAY_SETUP_DEMO_GAMERTAG = "343GuiltySpark";

interface Config {
  readonly authService: AuthService;
  readonly store: OverlaySetupStore;
}

export class OverlaySetupPresenter {
  private readonly config: Config;
  private loadSeq = 0;

  public constructor(config: Config) {
    this.config = config;
  }

  public start(): void {
    const seq = ++this.loadSeq;
    this.config.store.update({
      authState: "loading",
      gamertag: null,
      xuid: null,
      avatarUrl: null,
      errorMessage: null,
    });
    void this.load(seq);
  }

  public dispose(): void {
    ++this.loadSeq;
  }

  public subscribe(listener: () => void): () => void {
    return this.config.store.subscribe(listener);
  }

  public getSnapshot(): OverlaySetupSnapshot {
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
          gamertag: OVERLAY_SETUP_DEMO_GAMERTAG,
          xuid: null,
          avatarUrl: null,
          errorMessage: null,
        }));
        return;
      }

      this.applySnapshot(() => ({
        authState: "authenticated",
        gamertag: session.xboxGamertag ?? null,
        xuid: session.xboxXuid ?? null,
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
        xuid: null,
        avatarUrl: null,
        errorMessage: "Failed to load session. Please refresh the page.",
      }));
    }
  }

  private applySnapshot(updater: (s: OverlaySetupSnapshot) => OverlaySetupSnapshot): void {
    this.config.store.update(updater(this.config.store.getSnapshot()));
  }
}
