import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { IndividualTrackerService } from "../../services/individual-tracker/types";
import type {
  IndividualTrackerManagerSnapshot,
  IndividualTrackerManagerStore,
} from "./individual-tracker-manager-store";
import type { TrackerRowAction } from "./manager-model";
import { isValidGamertagInput, toManagerModel } from "./manager-model";
import type { IndividualTrackerManagerViewModel } from "./types";

interface Config {
  readonly individualTrackerService: IndividualTrackerService;
  readonly store: IndividualTrackerManagerStore;
}

export class IndividualTrackerManagerPresenter {
  private readonly config: Config;
  private isDisposed = false;

  public constructor(config: Config) {
    this.config = config;
  }

  public static present(snapshot: IndividualTrackerManagerSnapshot): IndividualTrackerManagerViewModel {
    const model = toManagerModel(snapshot.trackers);
    return {
      model,
      profileName: snapshot.profileName,
      gamertagInput: snapshot.gamertagInput,
      addPending: snapshot.addPending,
      pendingTrackerId: snapshot.pendingTrackerId,
      addDisabled: !model.canAddTracker || snapshot.addPending || !isValidGamertagInput(snapshot.gamertagInput),
    };
  }

  public start(): void {
    void this.load();
  }

  public dispose(): void {
    this.isDisposed = true;
  }

  public setGamertagInput(value: string): void {
    if (this.isDisposed) {
      return;
    }
    this.config.store.setGamertagInput(value);
  }

  public addTracker(): void {
    const { gamertagInput } = this.config.store.getSnapshot();
    if (!isValidGamertagInput(gamertagInput)) {
      return;
    }
    const gamertag = gamertagInput.trim();

    this.config.store.setAddPending(true);
    this.config.individualTrackerService
      .startTracker({ gamertag })
      .then(async () => this.refreshTrackers())
      .then(() => {
        if (this.isDisposed) {
          return;
        }
        this.config.store.setGamertagInput("");
      })
      .catch((error: unknown) => {
        if (this.isDisposed) {
          return;
        }
        this.config.store.setError(error instanceof Error ? error.message : "Failed to start tracker");
      })
      .finally(() => {
        if (this.isDisposed) {
          return;
        }
        this.config.store.setAddPending(false);
      });
  }

  public runRowAction(trackerId: string, action: TrackerRowAction): void {
    this.config.store.setPendingTrackerId(trackerId);
    this.invokeRowAction(trackerId, action)
      .then(async () => this.refreshTrackers())
      .catch((error: unknown) => {
        if (this.isDisposed) {
          return;
        }
        this.config.store.setError(error instanceof Error ? error.message : "Tracker action failed");
      })
      .finally(() => {
        if (this.isDisposed) {
          return;
        }
        this.config.store.setPendingTrackerId(null);
      });
  }

  private async load(): Promise<void> {
    this.config.store.setLoading();
    try {
      const [profileResponse, trackersResponse] = await Promise.all([
        this.config.individualTrackerService.getProfile(),
        this.config.individualTrackerService.listTrackers(),
      ]);
      if (this.isDisposed) {
        return;
      }
      this.config.store.setLoaded(profileResponse.profile.name, trackersResponse.trackers);
    } catch (error) {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setError(error instanceof Error ? error.message : "Failed to load trackers");
    }
  }

  private async refreshTrackers(): Promise<void> {
    const trackersResponse = await this.config.individualTrackerService.listTrackers();
    if (this.isDisposed) {
      return;
    }
    this.config.store.setTrackers(trackersResponse.trackers);
  }

  private async invokeRowAction(trackerId: string, action: TrackerRowAction): Promise<void> {
    switch (action) {
      case "stop": {
        await this.config.individualTrackerService.stopTracker(trackerId);
        return;
      }
      case "pause": {
        await this.config.individualTrackerService.pauseTracker(trackerId);
        return;
      }
      case "resume": {
        await this.config.individualTrackerService.resumeTracker(trackerId);
        return;
      }
      case "setLive": {
        await this.config.individualTrackerService.selectActive(trackerId);
        return;
      }
      default: {
        throw new UnreachableError(action);
      }
    }
  }
}
