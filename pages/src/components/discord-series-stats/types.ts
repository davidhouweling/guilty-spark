import type { MatchStatsData } from "../../controllers/stats/types";
import type { KillMatrixPivotData } from "../../controllers/stats/kill-matrix/types";
import type { TeamColor } from "../team-colors/team-colors";
import type { ComponentLoaderStatus } from "../component-loader/component-loader";

export interface DiscordSeriesMatchSummary {
  readonly matchId: string;
  readonly gameMapThumbnailUrl: string;
  readonly gameModeIconUrl: string;
  readonly gameModeAlt: string;
  readonly gameScore: string;
  readonly gameSubScore: string | null;
  readonly gameMap: string;
  readonly winningTeamColorHex: string | null;
}

export interface DiscordSeriesTeamCard {
  readonly name: string;
  readonly players: readonly string[];
  readonly teamColorHex: string;
}

export interface DiscordSeriesMatchDetail {
  readonly matchId: string;
  readonly data: MatchStatsData[] | null;
  readonly gameMapThumbnailUrl: string;
  readonly gameModeIconUrl: string;
  readonly gameModeAlt: string;
  readonly matchNumber: number;
  readonly gameTypeAndMap: string;
  readonly duration: string;
  readonly score: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly teamColors: readonly TeamColor[];
  readonly killMatrixPivotData: KillMatrixPivotData;
  readonly killMatrixStatus: ComponentLoaderStatus;
}

interface DiscordSeriesSeriesStats {
  readonly teamData: MatchStatsData[];
  readonly playerData: MatchStatsData[];
  readonly metadata: {
    readonly score: string;
    readonly duration: string;
    readonly startTime: string;
    readonly endTime: string;
  } | null;
  readonly teamColors: readonly TeamColor[];
  readonly killMatrixPivotData: KillMatrixPivotData;
  readonly killMatrixStatus: ComponentLoaderStatus;
}

export interface DiscordSeriesStatsViewModel {
  readonly title: string;
  readonly subtitle: string;
  readonly seriesScore: string;
  readonly matchSummaries: readonly DiscordSeriesMatchSummary[];
  readonly teams: readonly DiscordSeriesTeamCard[];
  readonly seriesStats: DiscordSeriesSeriesStats | null;
  readonly matchDetails: readonly DiscordSeriesMatchDetail[];
}
