import type { IndividualTrackerService } from "../../services/individual-tracker/types";
import { createCapabilityPreviewData, createFixtureCapabilityPreviewData } from "./capability-preview-data";
import type { CapabilityPreviewStore } from "./capability-preview-store";

interface Config {
  readonly individualTrackerService: IndividualTrackerService;
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
}
