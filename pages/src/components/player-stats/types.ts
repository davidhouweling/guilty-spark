import type { LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { LeaderboardPlayerRelationshipMetric } from "@guilty-spark/shared/halo/leaderboard-formatting";
import type { PlayerStatsResponse } from "@guilty-spark/shared/contracts/stats/player";
import type { PlayerStatsService } from "../../services/player-stats/player-stats-types";
import type { PlayerStatsSnapshot } from "./player-stats-store";

export type PlayerStatsTabId = "stats" | "head-to-head";

export interface PlayerStatsOption {
  readonly value: string;
  readonly label: string;
}

export interface PlayerLeaderboardStatRow {
  readonly stat: string;
  readonly rank: string;
  readonly value: string;
  readonly sortRank?: number | undefined;
  readonly sortValue: number;
}

export interface PlayerRelationshipRow {
  readonly player: string;
  readonly rank: string;
  readonly value: string;
  readonly sortRank: number;
  readonly sortValue: number;
  readonly sharedCount: number;
  readonly wins: number;
  readonly perfects: number;
}

export interface PlayerStatsViewModel {
  readonly state: PlayerStatsSnapshot["status"];
  readonly errorMessage?: string | null | undefined;
  readonly gamertag: string;
  readonly scopeLabel: string;
  readonly servers: readonly PlayerStatsOption[];
  readonly queueOptions: readonly PlayerStatsOption[];
  readonly windowOptions: readonly PlayerStatsOption[];
  readonly relationshipMetricOptions: readonly PlayerStatsOption[];
  readonly selectedGuildId: string;
  readonly selectedQueueChannelId: string | null;
  readonly selectedWindow: LeaderboardWindow;
  readonly selectedTabId: PlayerStatsTabId;
  readonly selectedRelationshipMetric: LeaderboardPlayerRelationshipMetric;
  readonly statsRows: readonly PlayerLeaderboardStatRow[];
  readonly relationshipRows: readonly PlayerRelationshipRow[];
  readonly statsFooter?: string | undefined;
  readonly relationshipFooter?: string | undefined;
  readonly onGuildChange: (value: string) => void;
  readonly onQueueChange: (value: string) => void;
  readonly onWindowChange: (value: string) => void;
  readonly onTabChange: (tabId: PlayerStatsTabId) => void;
  readonly onRelationshipMetricChange: (metric: string) => void;
}

export interface CreatePlayerStatsConfig {
  readonly service: PlayerStatsService;
  readonly gamertag: string;
  readonly initialResponse?: PlayerStatsResponse | undefined;
}
