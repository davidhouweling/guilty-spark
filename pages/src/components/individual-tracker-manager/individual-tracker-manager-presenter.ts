import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";
import type { IndividualTrackerService } from "../../services/individual-tracker/types";
import type {
  IndividualTrackerManagerSnapshot,
  IndividualTrackerManagerStore,
} from "./individual-tracker-manager-store";
import type { TrackerRowAction } from "./manager-model";
import {
  isValidGamertagInput,
  isValidIdleTimeoutHoursInput,
  isValidSearchStartTimeInput,
  parseIdleTimeoutHours,
  parseSearchStartTime,
  toManagerModel,
} from "./manager-model";
import type { IndividualTrackerManagerViewModel } from "./types";

interface Config {
  readonly individualTrackerService: IndividualTrackerService;
  readonly settingsService: IndividualTrackerSettingsService;
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
    const addDisabled =
      !model.canAddTracker ||
      snapshot.addPending ||
      !isValidGamertagInput(snapshot.gamertagInput) ||
      !isValidSearchStartTimeInput(snapshot.searchStartTime) ||
      !isValidIdleTimeoutHoursInput(snapshot.idleTimeoutHours);
    return {
      model,
      profileName: snapshot.profileName,
      isAddDialogOpen: snapshot.isAddDialogOpen,
      gamertagInput: snapshot.gamertagInput,
      searchStartTime: snapshot.searchStartTime,
      idleTimeoutHours: snapshot.idleTimeoutHours,
      addPending: snapshot.addPending,
      pendingTrackerId: snapshot.pendingTrackerId,
      addDisabled,
      settings: snapshot.settings,
      settingsSaving: snapshot.settingsSaving,
      settingsError: snapshot.settingsError,
    };
  }

  public start(): void {
    void this.load();
  }

  public dispose(): void {
    this.isDisposed = true;
  }

  public openAddDialog(): void {
    if (this.isDisposed) {
      return;
    }
    this.resetAddFields();
    this.config.store.setAddDialogOpen(true);
  }

  public closeAddDialog(): void {
    if (this.isDisposed) {
      return;
    }
    this.config.store.setAddDialogOpen(false);
    this.resetAddFields();
  }

  public setGamertagInput(value: string): void {
    if (this.isDisposed) {
      return;
    }
    this.config.store.setGamertagInput(value);
  }

  public setSearchStartTime(value: string): void {
    if (this.isDisposed) {
      return;
    }
    this.config.store.setSearchStartTime(value);
  }

  public setIdleTimeoutHours(value: string): void {
    if (this.isDisposed) {
      return;
    }
    this.config.store.setIdleTimeoutHours(value);
  }

  public addTracker(): void {
    if (this.isDisposed) {
      return;
    }
    const { gamertagInput, searchStartTime, idleTimeoutHours, addPending } = this.config.store.getSnapshot();
    if (addPending) {
      return;
    }
    if (!isValidGamertagInput(gamertagInput)) {
      return;
    }
    if (!isValidSearchStartTimeInput(searchStartTime) || !isValidIdleTimeoutHoursInput(idleTimeoutHours)) {
      return;
    }

    const parsedSearchStartTime = parseSearchStartTime(searchStartTime);
    const parsedIdleTimeoutHours = parseIdleTimeoutHours(idleTimeoutHours);
    const request = {
      gamertag: gamertagInput.trim(),
      ...(parsedSearchStartTime !== null ? { searchStartTime: parsedSearchStartTime } : {}),
      ...(parsedIdleTimeoutHours !== null ? { idleTimeoutHours: parsedIdleTimeoutHours } : {}),
    };

    this.config.store.setAddPending(true);
    this.config.individualTrackerService
      .startTracker(request)
      .then(async () => this.refreshTrackers())
      .then(() => {
        if (this.isDisposed) {
          return;
        }
        this.config.store.setAddDialogOpen(false);
        this.resetAddFields();
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
    if (this.isDisposed) {
      return;
    }
    if (this.config.store.getSnapshot().pendingTrackerId !== null) {
      return;
    }
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

  private resetAddFields(): void {
    this.config.store.setGamertagInput("");
    this.config.store.setSearchStartTime("");
    this.config.store.setIdleTimeoutHours("");
  }

  public updateSettings(settings: StreamerViewSettings): void {
    if (this.isDisposed) {
      return;
    }
    this.config.store.setSettingsSaving(true);
    this.config.store.setSettingsError(null);
    this.config.settingsService
      .updateSettings(settings)
      .then((saved) => {
        if (!this.isDisposed) {
          this.config.store.setSettings(saved);
        }
      })
      .catch((err: unknown) => {
        if (!this.isDisposed) {
          this.config.store.setSettingsError(err instanceof Error ? err.message : "Failed to save settings");
        }
      })
      .finally(() => {
        if (this.isDisposed) {
          return;
        }
        this.config.store.setSettingsSaving(false);
      });
  }

  private async load(): Promise<void> {
    this.config.store.setLoading();
    try {
      const [profileResponse, trackersResponse, settings] = await Promise.all([
        this.config.individualTrackerService.getProfile(),
        this.config.individualTrackerService.listTrackers(),
        this.config.settingsService.getSettings().catch((): StreamerViewSettings => ({})),
      ]);
      if (this.isDisposed) {
        return;
      }
      this.config.store.setLoaded(profileResponse.profile.name, trackersResponse.trackers);
      this.config.store.setSettings(settings);
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
