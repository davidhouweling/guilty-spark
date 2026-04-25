import type { Services } from "../../services/types";
import type { IndividualTrackerSectionId, IndividualTrackerSnapshot } from "./types";
import type { IndividualTrackerStore } from "./individual-tracker-store";
import type { LiveTrackersController } from "./live-trackers/types";

interface Config {
  readonly services: Services;
  readonly store: IndividualTrackerStore;
  readonly liveTrackersController: LiveTrackersController;
  readonly assignLocation?: (url: string) => void;
}

export class IndividualTrackerPresenter {
  private readonly config: Config;
  private isDisposed = false;

  public constructor(config: Config) {
    this.config = config;
  }

  public start(): void {
    this.config.liveTrackersController.start();
    void this.refresh();
  }

  public dispose(): void {
    this.isDisposed = true;
    this.config.liveTrackersController.dispose();
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
    this.updateSnapshot((snapshot) => ({ ...snapshot, activeSection: sectionId }));
  }

  public async signIn(): Promise<void> {
    this.updateSnapshot((snapshot) => ({ ...snapshot, errorMessage: null }));

    try {
      const { authUrl } = await this.config.services.authService.startMicrosoftAuth("/individual-tracker");
      this.assignLocation(authUrl);
    } catch (error) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        errorMessage: error instanceof Error ? error.message : "Failed to start Microsoft sign-in.",
      }));
    }
  }

  private updateSnapshot(updater: (snapshot: IndividualTrackerSnapshot) => IndividualTrackerSnapshot): void {
    if (this.isDisposed) {
      return;
    }

    this.config.store.snapshot = updater(this.config.store.snapshot);
    this.notifySubscribers();
  }

  private notifySubscribers(): void {
    for (const subscriber of this.config.store.subscribers) {
      subscriber();
    }
  }

  private assignLocation(url: string): void {
    if (this.config.assignLocation != null) {
      this.config.assignLocation(url);
      return;
    }

    window.location.assign(url);
  }

  private async refresh(): Promise<void> {
    this.updateSnapshot((snapshot) => ({ ...snapshot, loading: true, errorMessage: null }));

    try {
      const session = await this.config.services.authService.getSession();
      const userId = session.userId ?? null;

      if (!session.authenticated || userId == null) {
        this.config.liveTrackersController.resetForUnauthenticated();
        this.updateSnapshot((snapshot) => ({
          ...snapshot,
          authState: "unauthenticated",
        }));
        return;
      }

      this.config.liveTrackersController.setSessionContext(userId, session.xboxGamertag ?? null);
      await this.config.liveTrackersController.refresh();

      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        authState: "authenticated",
      }));
    } catch (error) {
      this.updateSnapshot((snapshot) => ({
        ...snapshot,
        errorMessage: error instanceof Error ? error.message : "Failed to load individual tracker.",
      }));
    } finally {
      this.updateSnapshot((snapshot) => ({ ...snapshot, loading: false }));
    }
  }
}
