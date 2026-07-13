import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import { ComponentLoaderStatus } from "../component-loader/component-loader";

export interface DiscordSeriesStatsSnapshot {
  readonly analyticsByMatchId: ReadonlyMap<string, MatchAnalytics>;
  readonly analyticsStatus: ComponentLoaderStatus;
  readonly medalMetadata: MedalMetadata;
}

export class DiscordSeriesStatsStore {
  private snapshot: DiscordSeriesStatsSnapshot;
  private readonly subscribers = new Set<() => void>();

  constructor() {
    this.snapshot = {
      analyticsByMatchId: new Map(),
      analyticsStatus: ComponentLoaderStatus.PENDING,
      medalMetadata: {},
    };
  }

  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  getSnapshot(): DiscordSeriesStatsSnapshot {
    return this.snapshot;
  }

  update(partial: Partial<DiscordSeriesStatsSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
