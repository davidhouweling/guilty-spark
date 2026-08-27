import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import type { NeatQueueClientService } from "../../../services/neatqueue/types";
import { toManualSeriesTeams } from "../../individual-tracker/manual-series-dialog/manual-series-dialog-store";
import type { LiveNeatQueueSeriesStore } from "./live-neatqueue-series-store";
import type { LiveNeatQueueSeriesSnapshot, SeriesCard } from "./types";

interface Config {
  readonly neatQueueService: NeatQueueClientService;
  readonly individualTrackerService: IndividualTrackerService;
  readonly store: LiveNeatQueueSeriesStore;
  readonly onTrackerCreated?: (() => void) | undefined;
}

function sourceKey(guildId: string, queueNumber: number): string {
  return `${guildId}:${queueNumber.toString()}`;
}

export class LiveNeatQueueSeriesPresenter {
  private readonly config: Config;
  private isDisposed = false;

  public constructor(config: Config) {
    this.config = config;
  }

  public start(): void {
    this.isDisposed = false;
    this.refresh();
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

  public getSnapshot(): LiveNeatQueueSeriesSnapshot {
    return this.config.store.snapshot;
  }

  public getSeriesCards(): readonly SeriesCard[] {
    const snapshot = this.getSnapshot();
    return snapshot.series.map((series) => ({
      guildId: series.guildId,
      queueNumber: series.queueNumber,
      title: series.title,
      subtitle: series.subtitle,
      guildIconUrl: series.guildIconUrl,
      teamNames: series.teams.map((team) => team.name),
      busy: snapshot.busySourceKey === sourceKey(series.guildId, series.queueNumber),
    }));
  }

  public refresh(): void {
    void this.refreshAsync();
  }

  public track(guildId: string, queueNumber: number): void {
    void this.openDialogAsync(guildId, queueNumber, false);
  }

  public goLive(guildId: string, queueNumber: number): void {
    void this.openDialogAsync(guildId, queueNumber, true);
  }

  public closeDialog(): void {
    this.updateSnapshot((s) => (s.busySourceKey != null ? s : { ...s, dialogState: null }));
  }

  public handleSeriesStarted(): void {
    void this.handleSeriesStartedAsync();
  }

  private async refreshAsync(): Promise<void> {
    this.updateSnapshot((s) => ({ ...s, loading: true, errorMessage: null }));
    try {
      const series = await this.config.neatQueueService.listActiveSeries();
      this.updateSnapshot((s) => ({ ...s, series }));
    } catch (error) {
      this.updateSnapshot((s) => ({
        ...s,
        errorMessage: error instanceof Error ? error.message : "Failed to load active NeatQueue series.",
      }));
    } finally {
      this.updateSnapshot((s) => ({ ...s, loading: false }));
    }
  }

  private async openDialogAsync(guildId: string, queueNumber: number, goLiveOnSubmit: boolean): Promise<void> {
    const series = this.getSnapshot().series.find((s) => s.guildId === guildId && s.queueNumber === queueNumber);
    if (series == null) {
      this.updateSnapshot((s) => ({ ...s, errorMessage: "This series is no longer active. Refresh and try again." }));
      return;
    }

    const key = sourceKey(guildId, queueNumber);
    this.updateSnapshot((s) => ({ ...s, busySourceKey: key, errorMessage: null }));
    try {
      const { tracker } = await this.config.individualTrackerService.startSeriesTracker({ guildId, queueNumber });
      this.updateSnapshot((s) => ({
        ...s,
        dialogState: {
          trackerId: tracker.trackerId,
          trackerLabel: series.title,
          initialData: {
            title: series.title,
            subtitle: series.subtitle,
            teams: toManualSeriesTeams(series.teams),
          },
          goLiveOnSubmit,
        },
      }));
    } catch (error) {
      this.updateSnapshot((s) => ({
        ...s,
        errorMessage: error instanceof Error ? error.message : "Failed to start tracking this series.",
      }));
    } finally {
      this.updateSnapshot((s) => ({ ...s, busySourceKey: null }));
    }
  }

  private async handleSeriesStartedAsync(): Promise<void> {
    const { dialogState } = this.getSnapshot();
    if (dialogState == null) {
      return;
    }

    if (dialogState.goLiveOnSubmit) {
      try {
        await this.config.individualTrackerService.selectActive(dialogState.trackerId);
      } catch (error) {
        this.updateSnapshot((s) => ({
          ...s,
          errorMessage: error instanceof Error ? error.message : "Failed to set the series live.",
        }));
      }
    }

    this.updateSnapshot((s) => ({ ...s, dialogState: null }));
    this.config.onTrackerCreated?.();
  }

  private updateSnapshot(updater: (snapshot: LiveNeatQueueSeriesSnapshot) => LiveNeatQueueSeriesSnapshot): void {
    if (this.isDisposed) {
      return;
    }
    this.config.store.snapshot = updater(this.config.store.snapshot);
    for (const subscriber of this.config.store.subscribers) {
      subscriber();
    }
  }
}
