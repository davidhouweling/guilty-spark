import type { ActiveSeriesSummary } from "@guilty-spark/shared/contracts/neatqueue/active-series";

export interface NeatQueueClientService {
  listActiveSeries(): Promise<readonly ActiveSeriesSummary[]>;
}
