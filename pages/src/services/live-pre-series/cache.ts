import type { LivePreSeriesResponse } from "@guilty-spark/shared/contracts/stats/pre-series";
import type { LivePreSeriesScope, LivePreSeriesService } from "./types";

interface Entry {
  readonly key: string;
  readonly request: Promise<LivePreSeriesResponse>;
}

/**
 * Instantiate once inside each live mount boundary and share between table/ticker.
 * Holds only the current scope. No expiry/polling: final live values survive until
 * roster invalidation or scope change. Archive consumers must never load this cache.
 * Old callers still receive their own result; the mount must ignore it if its scope
 * changed. Old completion cannot overwrite or evict the current cached request.
 */
export class LivePreSeriesCache {
  private entry: Entry | undefined;
  private generation = 0;

  public constructor(private readonly service: LivePreSeriesService) {}

  public async load(scope: LivePreSeriesScope): Promise<LivePreSeriesResponse> {
    const key = JSON.stringify([scope.guildId, scope.queueNumber, scope.seriesStartedAt, scope.rosterRevision]);
    if (this.entry?.key === key) {
      return this.entry.request;
    }
    this.generation += 1;
    const entry: Entry = { key, request: this.loadAsync(scope, this.generation) };
    this.entry = entry;
    return entry.request;
  }

  /** Call on substitution (even if a roster token is reused), not on final stop. */
  public invalidateRoster(): void {
    this.generation += 1;
    this.entry = undefined;
  }

  private async loadAsync(scope: LivePreSeriesScope, generation: number): Promise<LivePreSeriesResponse> {
    try {
      const data = await Promise.resolve().then(async () =>
        this.service.getCapturedRoster({ guildId: scope.guildId, queueNumber: scope.queueNumber }),
      );
      if (data.status !== "resolved" && this.generation === generation) {
        this.entry = undefined;
      }
      return data;
    } catch (error) {
      if (this.generation === generation) {
        this.entry = undefined;
      }
      throw error;
    }
  }
}
