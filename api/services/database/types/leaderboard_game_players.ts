export interface LeaderboardGamePlayersRow {
  MatchId: string;
  GuildId: string;
  QueueNumber: number;
  QueueChannelId: string;
  XboxXuid: string;
  DiscordUserId: string | null;
  GamertagSnapshot: string;
  TeamId: number;
  PresentAtBeginning: 0 | 1;
  RankInMatch: number | null;
  PersonalScore: number;
  Kills: number;
  Deaths: number;
  Assists: number;
  Kda: number;
  Accuracy: number;
  ShotsHit: number;
  ShotsFired: number;
  DamageDealt: number;
  DamageTaken: number;
  DamageRatio: number;
  AvgLifeSeconds: number;
  AvgDamagePerLife: number;
  ObjectiveStatsJson: string;
  MedalsJson: string;
  CreatedAt: number;
}
