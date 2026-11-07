import type { LivePreSeriesResponse } from "@guilty-spark/shared/contracts/stats/pre-series";

export interface LivePreSeriesIdentity {
  readonly guildId: string;
  readonly queueNumber: string;
}

export interface LivePreSeriesService {
  getCapturedRoster(identity: LivePreSeriesIdentity): Promise<LivePreSeriesResponse>;
}

export interface LivePreSeriesScope extends LivePreSeriesIdentity {
  readonly seriesStartedAt: string;
  /** Caller-owned current roster token; not a new server revision protocol. */
  readonly rosterRevision: string;
}
