import { z } from "zod";
import { defineContract } from "../base";
import { LeaderboardWindow } from "../../halo/leaderboard";

const playerQueueOptionSchema = z.object({
  channelId: z.string(),
  label: z.string(),
});

const playerServerOptionSchema = z.object({
  guildId: z.string(),
  guildName: z.string(),
  gamesPlayed: z.number().int().nonnegative(),
  queueOptions: z.array(playerQueueOptionSchema),
});

const playerStatsSchema = z.object({
  XboxXuid: z.string(),
  DiscordUserId: z.string().nullable(),
  Gamertag: z.string(),
  SeriesPlayed: z.number(),
  SeriesWins: z.number(),
  GamesPlayed: z.number(),
  GameWins: z.number(),
  PersonalScore: z.number(),
  AvgPersonalScorePerGame: z.number(),
  Kills: z.number(),
  AvgKillsPerGame: z.number(),
  Deaths: z.number(),
  AvgDeathsPerGame: z.number(),
  Assists: z.number(),
  AvgAssistsPerGame: z.number(),
  HeadshotKills: z.number(),
  AvgHeadshotKillsPerGame: z.number(),
  ShotsHit: z.number(),
  AvgShotsHitPerGame: z.number(),
  ShotsFired: z.number(),
  AvgShotsFiredPerGame: z.number(),
  DamageDealt: z.number(),
  AvgDamageDealtPerGame: z.number(),
  DamageTaken: z.number(),
  AvgDamageTakenPerGame: z.number(),
  Kda: z.number(),
  Accuracy: z.number(),
  DamageRatio: z.number(),
  AvgLifeSeconds: z.number(),
  AvgDamagePerLife: z.number(),
  MedalCount: z.number(),
  MedalPoints: z.number(),
  MythicMedalCount: z.number(),
  ObjectiveGamesPlayed: z.number(),
  ObjectiveTimeSeconds: z.number(),
  AvgObjectiveTimeSeconds: z.number(),
  ObjectiveTeamContribution: z.number(),
  ObjectiveTeamContributionGamesPlayed: z.number(),
  CtfGamesPlayed: z.number(),
  StrongholdGamesPlayed: z.number(),
  HillGamesPlayed: z.number(),
  BallGamesPlayed: z.number(),
  FlagCaptures: z.number(),
  FlagCaptureAssists: z.number(),
  FlagGrabs: z.number(),
  FlagReturns: z.number(),
  FlagSecures: z.number(),
  FlagSteals: z.number(),
  FlagCarriersKilled: z.number(),
  FlagReturnersKilled: z.number(),
  FlagCarrierKills: z.number(),
  FlagReturnerKills: z.number(),
  StrongholdCaptures: z.number(),
  StrongholdSecures: z.number(),
  StrongholdOffensiveKills: z.number(),
  StrongholdDefensiveKills: z.number(),
  HillScoringTicks: z.number(),
  HillOffensiveKills: z.number(),
  HillDefensiveKills: z.number(),
  BallScoringTicks: z.number(),
  BallGrabs: z.number(),
  BallCarriersKilled: z.number(),
  BallCarrierKills: z.number(),
});

const playerMetricRankSchema = z.object({
  rank: z.number(),
  total: z.number(),
});

const playerRelationshipRowSchema = z.object({
  XboxXuid: z.string(),
  DiscordUserId: z.string().nullable(),
  Gamertag: z.string(),
  MetricValue: z.number(),
  SharedCount: z.number(),
  Wins: z.number(),
  Perfects: z.number(),
});

const playerHeadToHeadSummarySchema = z.object({
  xboxXuid: z.string(),
  discordUserId: z.string().nullable(),
  gamertag: z.string(),
  kills: z.number().int().nonnegative(),
  killsPerfects: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  deathsPerfects: z.number().int().nonnegative(),
  headToHeadGames: z.number().int().nonnegative(),
  gamesWith: z.number().int().nonnegative(),
  gameWinsWith: z.number().int().nonnegative(),
  gamesAgainst: z.number().int().nonnegative(),
  gameWinsAgainst: z.number().int().nonnegative(),
  opponentGameWins: z.number().int().nonnegative(),
  seriesWith: z.number().int().nonnegative(),
  seriesWinsWith: z.number().int().nonnegative(),
  seriesAgainst: z.number().int().nonnegative(),
  seriesWinsAgainst: z.number().int().nonnegative(),
  opponentSeriesWins: z.number().int().nonnegative(),
});

export const playerStatsParamsSchema = z.object({
  gamertag: z
    .string()
    .min(1)
    .transform((value, ctx) => {
      try {
        return decodeURIComponent(value);
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid gamertag encoding" });
        return z.NEVER;
      }
    }),
});

export const playerStatsQuerySchema = z.object({
  guildId: z.string().min(1).optional(),
  queueChannelId: z.string().min(1).optional(),
  window: z.enum(LeaderboardWindow).optional(),
  minGamesPlayed: z.coerce.number().int().min(1).max(10).optional(),
});

export const playerStatsContract = defineContract(
  z.object({
    player: z.object({
      xboxXuid: z.string(),
      gamertag: z.string(),
    }),
    servers: z.array(playerServerOptionSchema).min(1),
    selectedGuildId: z.string(),
    selectedGuildName: z.string(),
    queueOptions: z.array(playerQueueOptionSchema),
    window: z.enum(LeaderboardWindow),
    resetAt: z.number().int().nonnegative().nullable(),
    stats: playerStatsSchema.nullable(),
    ranks: z.record(z.string(), playerMetricRankSchema.nullable()).default({}),
    relationships: z.record(z.string(), z.array(playerRelationshipRowSchema)).default({}),
    headToHeadSummaries: z.array(playerHeadToHeadSummarySchema).default([]),
    minGamesPlayed: z.number().int().min(1).max(10).default(5),
    totalPlayers: z.number().int().nonnegative().nullable().default(null),
  }),
);

export type PlayerHeadToHeadSummary = z.infer<typeof playerHeadToHeadSummarySchema>;
export type PlayerStatsResponse = z.infer<typeof playerStatsContract.schema>;
export type PlayerStatsDiscoveryResponse = Omit<
  PlayerStatsResponse,
  "window" | "resetAt" | "stats" | "ranks" | "relationships" | "headToHeadSummaries" | "minGamesPlayed" | "totalPlayers"
>;
