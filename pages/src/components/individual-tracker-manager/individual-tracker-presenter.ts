import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
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

  public getSnapshot(): IndividualTrackerSnapshot {
    return this.config.store.snapshot;
  }

  public setActiveSection(sectionId: IndividualTrackerSectionId): void {
    this.applySnapshot((s) => ({ ...s, activeSection: sectionId }));
  }

  public signIn(): void {
    const loginUrl = new URL("/login", window.location.origin);
    loginUrl.searchParams.set("redirect", window.location.pathname);
    window.location.assign(loginUrl.toString());
  }

  private async load(seq: number): Promise<void> {
    try {
      const session = await this.config.authService.getSession();

      if (seq !== this.loadSeq) {
        return;
      }

      if (!session.authenticated) {
        this.config.liveTrackersController.resetForUnauthenticated();
        this.updateSnapshot(seq, (s) => ({ ...s, authState: "unauthenticated", errorMessage: null }));
        return;
      }

      const settings = await this.config.settingsService.getSettings().catch((): StreamerViewSettings => ({}));

      if (seq !== this.loadSeq) {
        return;
      }

      this.config.liveTrackersController.setSessionContext(
        session.userId,
        session.xboxGamertag ?? null,
        session.xboxXuid ?? null,
      );

      this.updateSnapshot(seq, (s) => ({
        ...s,
        authState: "authenticated",
        errorMessage: null,
        streamerSettings: settings,
        gamertag: session.xboxGamertag ?? null,
      }));
    } catch {
      if (seq !== this.loadSeq) {
        return;
      }
      this.updateSnapshot(seq, (s) => ({
        ...s,
        authState: "unauthenticated",
        errorMessage: "Failed to load session. Please refresh the page.",
      }));
    }
  }

  private updateSnapshot(seq: number, updater: (s: IndividualTrackerSnapshot) => IndividualTrackerSnapshot): void {
    if (seq !== this.loadSeq) {
      return;
    }
    this.applySnapshot(updater);
  }

  private applySnapshot(updater: (s: IndividualTrackerSnapshot) => IndividualTrackerSnapshot): void {
    this.config.store.snapshot = updater(this.config.store.snapshot);
    for (const listener of this.config.store.subscribers) {
      listener();
    }
  }
}
