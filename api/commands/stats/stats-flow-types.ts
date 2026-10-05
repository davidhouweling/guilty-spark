import type { QueueData } from "../../services/discord/discord";
import type { ManualSeriesScore, ManualSeriesTeam } from "./manual-series";

export type FixSeriesSourceKind = "neatqueue-result" | "series-overview";
export type FixSeriesOutcome = "TEAM_0" | "TEAM_1" | "TIE";

export interface FixFlowMetadata extends Record<string, unknown> {
  guildId: string;
  channelId: string;
  sourceKind?: FixSeriesSourceKind | undefined;
  isManualSeries?: boolean | undefined;
  queueData: Omit<QueueData, "timestamp">;
  selectedPlayerId?: string;
  selectedMatchIds?: string[];
  selectedSeriesOutcome?: FixSeriesOutcome;
}

export interface FixSeriesSource {
  queueData: QueueData;
  channelId: string;
  sourceKind: FixSeriesSourceKind;
  isManualSeries: boolean;
}

export interface ManualFlowMetadata extends Record<string, unknown> {
  guildId: string;
  channelId: string;
  queueNumber: number;
  queueChannelId: string | null;
  queuePage?: number | undefined;
  selectedPlayerId?: string | undefined;
  selectedMatchIds?: string[] | undefined;
  teams?: ManualSeriesTeam[] | undefined;
  selectedSeriesOutcome?: FixSeriesOutcome | undefined;
  seriesScore?: ManualSeriesScore | undefined;
}
