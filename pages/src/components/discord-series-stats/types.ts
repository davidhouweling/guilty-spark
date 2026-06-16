import type { MatchStatsData } from "../../controllers/stats/types";
import type { KillMatrixViewRow } from "../../controllers/stats/kill-matrix/types";
import type { TeamColor } from "../team-colors/team-colors";

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
  readonly killMatrixRows: readonly KillMatrixViewRow[];
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
  readonly killMatrixRows: readonly KillMatrixViewRow[];
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
