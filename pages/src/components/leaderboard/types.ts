import type { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardSnapshot } from "./leaderboard-store";

export interface LeaderboardOption {
  readonly value: string;
  readonly label: string;
}

export interface LeaderboardOptionGroup {
  readonly label: string;
  readonly options: readonly LeaderboardOption[];
}

export interface LeaderboardTableRow {
  readonly rank: number;
  readonly gamertag: string;
  readonly value: string;
  readonly gamesPlayed: number;
  readonly xboxXuid: string;
}

export interface LeaderboardViewModel {
  readonly state: "loading" | "error" | "loaded";
  readonly errorMessage?: string | null | undefined;
  readonly title: string;
  readonly scopeLabel: string;
  readonly windowLabel: string;
  readonly metricLabel: string;
  readonly rows: readonly LeaderboardTableRow[];
  readonly queueOptions: readonly LeaderboardOption[];
  readonly windowOptions: readonly LeaderboardOption[];
  readonly metricGroups: readonly LeaderboardOptionGroup[];
  readonly selectedQueueChannelId: string | null;
  readonly selectedWindow: LeaderboardWindow;
  readonly selectedMetric: LeaderboardMetric;
  readonly onQueueChange: (value: string) => void;
  readonly onWindowChange: (value: string) => void;
  readonly onMetricChange: (value: string) => void;
}

export interface LeaderboardPresentableSnapshot extends LeaderboardSnapshot {
  readonly selectedQueueChannelId: string | null;
  readonly selectedWindow?: LeaderboardWindow;
  readonly selectedMetric?: LeaderboardMetric;
}
