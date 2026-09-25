import type { IndividualTrackerService } from "../../services/individual-tracker/types";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";
import {
  createCapabilityPreviewData,
  createCapabilityPreviewDataFromLiveView,
  createFixtureCapabilityPreviewData,
} from "./capability-preview-data";
import type { CapabilityPreviewStore } from "./capability-preview-store";

interface Config {
  readonly individualTrackerService: IndividualTrackerService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly store: CapabilityPreviewStore;
}

export class CapabilityPreviewPresenter {
  private readonly config: Config;
  private requestId = 0;

  public constructor(config: Config) {
    this.config = config;
  }

  public load(gamertag: string, xuid: string | null, isExample: boolean): void {
    const requestId = ++this.requestId;
    const fallback = createFixtureCapabilityPreviewData(gamertag);

    if (isExample || xuid === null) {
      this.config.store.update({ status: "loaded", data: fallback, errorMessage: null });
      return;
    }

    this.config.store.update({ status: "loading", data: fallback, errorMessage: null });
    void this.loadAsync(requestId, gamertag, xuid, fallback);
  }

  public dispose(): void {
    ++this.requestId;
  }

  private async loadAsync(
    requestId: number,
    gamertag: string,
    xuid: string,
    fallback: ReturnType<typeof createFixtureCapabilityPreviewData>,
  ): Promise<void> {
    try {
      const activeView = await this.getActiveViewAsync();
      if (requestId !== this.requestId) {
        return;
      }
      if (activeView !== null) {
        this.config.store.update({
          status: "loaded",
          data: createCapabilityPreviewDataFromLiveView(gamertag, activeView),
          errorMessage: null,
        });
        return;
      }

      const [matchmaking, custom] = await Promise.all([
        this.config.individualTrackerService.getMatchHistory(xuid, 0, 10, "all"),
        this.config.individualTrackerService.getMatchHistory(xuid, 0, 10, "custom"),
      ]);
      if (requestId !== this.requestId) {
        return;
      }
      this.config.store.update({
        status: "loaded",
        data: createCapabilityPreviewData(gamertag, matchmaking.matches, custom.matches),
        errorMessage: null,
      });
    } catch {
      if (requestId !== this.requestId) {
        return;
      }
      this.config.store.update({
        status: "error",
        data: fallback,
        errorMessage: "History preview unavailable. Showing an example preview.",
      });
    }
  }

  private async getActiveViewAsync(): Promise<Awaited<ReturnType<IndividualTrackerViewService["getView"]>>["view"] | null> {
    try {
      const trackerList = await this.config.individualTrackerService.getTrackers();
      const activeTracker = trackerList.trackers.find((tracker) => {
        const status = trackerList.statuses[tracker.trackerId]?.status;
        return status === "active" || status === "paused";
      });
      if (activeTracker === undefined) {
        return null;
      }
      const response = await this.config.individualTrackerViewService.getView(activeTracker.trackerId);
      return response.view;
    } catch {
      return null;
    }
  }
}
