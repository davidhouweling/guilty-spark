import type { PlayerCompareResponse } from "@guilty-spark/shared/contracts/stats/player";
import type { LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { PlayerCompareService } from "../../services/player-compare/player-compare-types";
import type { PlayerCompareSnapshot } from "./player-compare-store";

export type PlayerCompareTabId = "stats" | "head-to-head";

export interface PlayerCompareOption {
  readonly value: string;
  readonly label: string;
}

export interface PlayerCompareValueCell {
  readonly gamertag: string;
  readonly text: string;
  readonly sortValue?: number | undefined;
}

export interface PlayerCompareStatRow {
  readonly stat: string;
  readonly values: readonly PlayerCompareValueCell[];
}

export interface PlayerCompareViewModel {
  readonly state: PlayerCompareSnapshot["status"];
  readonly errorMessage?: string | null | undefined;
  readonly gamertags: readonly string[];
  readonly title: string;
  readonly scopeLabel: string;
  readonly servers: readonly PlayerCompareOption[];
  readonly queueOptions: readonly PlayerCompareOption[];
  readonly windowOptions: readonly PlayerCompareOption[];
  readonly selectedGuildId: string;
  readonly selectedQueueChannelId: string | null;
  readonly selectedWindow: LeaderboardWindow;
  readonly selectedMinGamesPlayed: number;
  readonly minGamesPlayedOptions: readonly PlayerCompareOption[];
  readonly selectedTabId: PlayerCompareTabId;
  readonly statsRows: readonly PlayerCompareStatRow[];
  readonly addPlayerValue: string;
  readonly canAddPlayer: boolean;
  readonly statusText: string;
  readonly onAddPlayerValueChange: (value: string) => void;
  readonly onAddPlayer: () => void;
  readonly onGuildChange: (value: string) => void;
  readonly onQueueChange: (value: string) => void;
  readonly onWindowChange: (value: string) => void;
  readonly onMinGamesPlayedChange: (value: string) => void;
  readonly onTabChange: (tabId: PlayerCompareTabId) => void;
}

export interface CreatePlayerCompareConfig {
  readonly service: PlayerCompareService;
  readonly gamertags: readonly string[];
  readonly initialResponse?: PlayerCompareResponse | undefined;
}
