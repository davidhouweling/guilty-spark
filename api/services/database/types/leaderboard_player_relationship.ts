import { LeaderboardPlayerRelationshipMetric } from "@guilty-spark/shared/halo/leaderboard-formatting";

export { LeaderboardPlayerRelationshipMetric };

export interface LeaderboardPlayerRelationshipRow {
  XboxXuid: string;
  DiscordUserId: string | null;
  Gamertag: string;
  MetricValue: number;
  SharedCount: number;
  Wins: number;
  Perfects: number;
}
