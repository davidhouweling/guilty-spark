import type { AuthService } from "../../services/auth/types";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";
import type { LiveTrackersController } from "./live-trackers/types";
import type {
  IndividualTrackerSectionId,
  IndividualTrackerSnapshot,
  IndividualTrackerStore,
} from "./individual-tracker-store";

interface Config {
  readonly authService: AuthService;
  readonly settingsService: IndividualTrackerSettingsService;
  readonly store: IndividualTrackerStore;
  readonly liveTrackersController: LiveTrackersController;
}

export class IndividualTrackerPresenter {
  private readonly config: Config;
  private isDisposed = false;

  public constructor(config: Config) {
    this.config = config;
  }

  public start(): void {
    this.isDisposed = false;
    void this.load();
  }

  public dispose(): void {
    this.isDisposed = true;
  }

  public subscribe(listener: () => void): () => void {
    this.config.store.subscribers.add(listener);
    return (): void => {
      this.config.store.subscribers.delete(listener);
    };
  }

  public getSnapshot(): IndividualTrackerSnapshot {
    return this.config.store.snapshot;
  }

  public setActiveSection(sectionId: IndividualTrackerSectionId): void {
    this.updateSnapshot((s) => ({ ...s, activeSection: sectionId }));
  }

  public signIn(): void {
    const loginUrl = new URL("/login", window.location.origin);
    loginUrl.searchParams.set("redirect", window.location.pathname);
    window.location.assign(loginUrl.toString());
  }

  private async load(): Promise<void> {
    try {
      const [session, settings] = await Promise.all([
        this.config.authService.getSession(),
        this.config.settingsService.getSettings(),
      ]);

      if (this.isDisposed) {
        return;
      }

      if (!session.authenticated) {
        this.config.liveTrackersController.resetForUnauthenticated();
        this.updateSnapshot((s) => ({ ...s, authState: "unauthenticated", errorMessage: null }));
        return;
      }

      this.config.liveTrackersController.setSessionContext(
        session.userId,
        session.xboxGamertag ?? null,
        session.xboxXuid ?? null,
      );

      this.updateSnapshot((s) => ({
        ...s,
        authState: "authenticated",
        errorMessage: null,
        streamerSettings: settings,
        gamertag: session.xboxGamertag ?? null,
      }));
    } catch {
      if (this.isDisposed) {
        return;
      }
      this.updateSnapshot((s) => ({
        ...s,
        authState: "unauthenticated",
        errorMessage: "Failed to load session. Please refresh the page.",
      }));
    }
  }

  private updateSnapshot(updater: (s: IndividualTrackerSnapshot) => IndividualTrackerSnapshot): void {
    if (this.isDisposed) {
      return;
    }
    this.config.store.snapshot = updater(this.config.store.snapshot);
    for (const listener of this.config.store.subscribers) {
      listener();
    }
  }
}
