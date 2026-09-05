import type { LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
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

export interface PlayerHeadToHeadTableRow {
  readonly player: string;
  readonly kills: number;
  readonly killsText: string;
  readonly deaths: number;
  readonly deathsText: string;
  readonly gamesWithTotal: number;
  readonly gamesWithText: string;
  readonly gamesWithWinRate: number;
  readonly seriesWithTotal: number;
  readonly seriesWithText: string;
  readonly seriesWithWinRate: number;
  readonly gamesAgainstTotal: number;
  readonly gamesAgainstText: string;
  readonly gamesAgainstWinRate: number;
  readonly seriesAgainstTotal: number;
  readonly seriesAgainstText: string;
  readonly seriesAgainstWinRate: number;
}

export interface PlayerStatsViewModel {
  readonly state: PlayerStatsSnapshot["status"];
  readonly errorMessage?: string | null | undefined;
  readonly gamertag: string;
  readonly scopeLabel: string;
  readonly servers: readonly PlayerStatsOption[];
  readonly queueOptions: readonly PlayerStatsOption[];
  readonly windowOptions: readonly PlayerStatsOption[];
  readonly selectedGuildId: string;
  readonly selectedQueueChannelId: string | null;
  readonly selectedWindow: LeaderboardWindow;
  readonly selectedTabId: PlayerStatsTabId;
  readonly statsRows: readonly PlayerLeaderboardStatRow[];
  readonly headToHeadRows: readonly PlayerHeadToHeadTableRow[];
  readonly statsFooter?: string | undefined;
  readonly headToHeadFooter?: string | undefined;
  readonly onGuildChange: (value: string) => void;
  readonly onQueueChange: (value: string) => void;
  readonly onWindowChange: (value: string) => void;
  readonly onTabChange: (tabId: PlayerStatsTabId) => void;
}

export interface CreatePlayerStatsConfig {
  readonly service: PlayerStatsService;
  readonly gamertag: string;
  readonly initialResponse?: PlayerStatsResponse | undefined;
}
