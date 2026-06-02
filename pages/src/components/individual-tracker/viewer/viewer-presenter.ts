import type {
  IndividualTrackerViewService,
  TrackerViewConnection,
  TrackerViewSubscription,
} from "../../../services/individual-tracker/view-types";
import { buildViewerRenderModel } from "./viewer-render-model";
import type { IndividualTrackerViewerSnapshot, IndividualTrackerViewerStore } from "./viewer-store";
import type { IndividualTrackerViewerViewModel } from "./types";

interface Config {
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly store: IndividualTrackerViewerStore;
  readonly trackerId: string;
}

export class IndividualTrackerViewerPresenter {
  private readonly config: Config;
  private isDisposed = false;
  private connection: TrackerViewConnection | null = null;
  private viewSubscription: TrackerViewSubscription | null = null;
  private statusSubscription: TrackerViewSubscription | null = null;

  public constructor(config: Config) {
    this.config = config;
  }

  public static present(snapshot: IndividualTrackerViewerSnapshot): IndividualTrackerViewerViewModel {
    return {
      renderModel: snapshot.view == null ? null : buildViewerRenderModel({ view: snapshot.view }),
      connectionStatus: snapshot.connectionStatus,
    };
  }

  public start(): void {
    void this.load();
  }

  public dispose(): void {
    this.isDisposed = true;
    this.viewSubscription?.unsubscribe();
    this.viewSubscription = null;
    this.statusSubscription?.unsubscribe();
    this.statusSubscription = null;
    this.connection?.disconnect();
    this.connection = null;
  }

  private async load(): Promise<void> {
    this.config.store.setLoading();
    try {
      const response = await this.config.individualTrackerViewService.getView(this.config.trackerId);
      if (this.isDisposed) {
        return;
      }
      this.config.store.setLoaded(response.view);
      this.openConnection();
    } catch (error) {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setError(error instanceof Error ? error.message : "Failed to load tracker");
    }
  }

  private openConnection(): void {
    this.viewSubscription?.unsubscribe();
    this.statusSubscription?.unsubscribe();
    this.connection?.disconnect();

    const connection = this.config.individualTrackerViewService.connect(this.config.trackerId);
    this.connection = connection;
    this.viewSubscription = connection.subscribe((view) => {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setView(view);
    });
    this.statusSubscription = connection.subscribeStatus((status) => {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setConnectionStatus(status);
    });
  }
}
