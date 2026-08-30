import { GameVariantCategory } from "halo-infinite-api";
import { UnreachableError } from "../base/unreachable-error";

export enum LeaderboardWindow {
  LastReset = "RESET",
  OneWeek = "1W",
  OneMonth = "1M",
  ThreeMonths = "3M",
  SixMonths = "6M",
  TwelveMonths = "12M",
}
export enum LeaderboardMetric {
  SeriesPlayed = "SERIES_PLAYED",
  SeriesWins = "SERIES_WINS",
  SeriesWinRate = "SERIES_WIN_RATE",
  GamesPlayed = "GAMES_PLAYED",
  GameWins = "GAME_WINS",
  MedalPoints = "MEDAL_POINTS",
  AvgMedalPointsPerSeries = "AVG_MEDAL_POINTS_PER_SERIES",
  AvgMedalPointsPerGame = "AVG_MEDAL_POINTS_PER_GAME",
  MythicMedals = "MYTHIC_MEDALS",
  AvgMythicMedalsPerSeries = "AVG_MYTHIC_MEDALS_PER_SERIES",
  AvgMythicMedalsPerGame = "AVG_MYTHIC_MEDALS_PER_GAME",
  ObjectiveTime = "OBJECTIVE_TIME",
  AvgObjectiveTimePerGame = "AVG_OBJECTIVE_TIME_PER_GAME",
  ObjectiveTeamContribution = "OBJECTIVE_TEAM_CONTRIBUTION",
  ObjectiveGameContribution = "OBJECTIVE_GAME_CONTRIBUTION",
  GamesWinRate = "GAMES_WIN_RATE",
  Kills = "KILLS",
  Deaths = "DEATHS",
  Assists = "ASSISTS",
  HeadshotKills = "HEADSHOT_KILLS",
  ShotsHit = "SHOTS_HIT",
  ShotsFired = "SHOTS_FIRED",
  Kda = "KDA",
  Accuracy = "ACCURACY",
  DamageDealt = "DAMAGE_DEALT",
  DamageTaken = "DAMAGE_TAKEN",
  DamageRatio = "DAMAGE_RATIO",
  AvgLifeSeconds = "AVG_LIFE_SECONDS",
  AvgDamagePerLife = "AVG_DAMAGE_PER_LIFE",
  PersonalScore = "PERSONAL_SCORE",
  AvgPersonalScorePerSeries = "AVG_PERSONAL_SCORE_PER_SERIES",
  AvgKillsPerSeries = "AVG_KILLS_PER_SERIES",
  AvgDeathsPerSeries = "AVG_DEATHS_PER_SERIES",
  AvgAssistsPerSeries = "AVG_ASSISTS_PER_SERIES",
  AvgHeadshotKillsPerSeries = "AVG_HEADSHOT_KILLS_PER_SERIES",
  AvgShotsHitPerSeries = "AVG_SHOTS_HIT_PER_SERIES",
  AvgShotsFiredPerSeries = "AVG_SHOTS_FIRED_PER_SERIES",
  AvgDamageDealtPerSeries = "AVG_DAMAGE_DEALT_PER_SERIES",
  AvgDamageTakenPerSeries = "AVG_DAMAGE_TAKEN_PER_SERIES",
  AvgPersonalScorePerGame = "AVG_PERSONAL_SCORE_PER_GAME",
  AvgKillsPerGame = "AVG_KILLS_PER_GAME",
  AvgDeathsPerGame = "AVG_DEATHS_PER_GAME",
  AvgAssistsPerGame = "AVG_ASSISTS_PER_GAME",
  AvgHeadshotKillsPerGame = "AVG_HEADSHOT_KILLS_PER_GAME",
  AvgShotsHitPerGame = "AVG_SHOTS_HIT_PER_GAME",
  AvgShotsFiredPerGame = "AVG_SHOTS_FIRED_PER_GAME",
  AvgDamageDealtPerGame = "AVG_DAMAGE_DEALT_PER_GAME",
  AvgDamageTakenPerGame = "AVG_DAMAGE_TAKEN_PER_GAME",
  FlagCaptures = "FLAG_CAPTURES_TOTAL",
  AvgFlagCapturesPerObjective = "AVG_FLAG_CAPTURES_PER_OBJECTIVE",
  FlagCaptureAssists = "FLAG_CAPTURE_ASSISTS_TOTAL",
  AvgFlagCaptureAssistsPerObjective = "AVG_FLAG_CAPTURE_ASSISTS_PER_OBJECTIVE",
  FlagGrabs = "FLAG_GRABS_TOTAL",
  AvgFlagGrabsPerObjective = "AVG_FLAG_GRABS_PER_OBJECTIVE",
  FlagReturns = "FLAG_RETURNS_TOTAL",
  AvgFlagReturnsPerObjective = "AVG_FLAG_RETURNS_PER_OBJECTIVE",
  FlagSecures = "FLAG_SECURES_TOTAL",
  AvgFlagSecuresPerObjective = "AVG_FLAG_SECURES_PER_OBJECTIVE",
  FlagSteals = "FLAG_STEALS_TOTAL",
  AvgFlagStealsPerObjective = "AVG_FLAG_STEALS_PER_OBJECTIVE",
  FlagCarriersKilled = "FLAG_CARRIERS_KILLED_TOTAL",
  AvgFlagCarriersKilledPerObjective = "AVG_FLAG_CARRIERS_KILLED_PER_OBJECTIVE",
  FlagReturnersKilled = "FLAG_RETURNERS_KILLED_TOTAL",
  AvgFlagReturnersKilledPerObjective = "AVG_FLAG_RETURNERS_KILLED_PER_OBJECTIVE",
  FlagCarrierKills = "FLAG_CARRIER_KILLS_TOTAL",
  AvgFlagCarrierKillsPerObjective = "AVG_FLAG_CARRIER_KILLS_PER_OBJECTIVE",
  FlagReturnerKills = "FLAG_RETURNER_KILLS_TOTAL",
  AvgFlagReturnerKillsPerObjective = "AVG_FLAG_RETURNER_KILLS_PER_OBJECTIVE",
  StrongholdCaptures = "STRONGHOLD_CAPTURES_TOTAL",
  AvgStrongholdCapturesPerObjective = "AVG_STRONGHOLD_CAPTURES_PER_OBJECTIVE",
  StrongholdSecures = "STRONGHOLD_SECURES_TOTAL",
  AvgStrongholdSecuresPerObjective = "AVG_STRONGHOLD_SECURES_PER_OBJECTIVE",
  StrongholdOffensiveKills = "STRONGHOLD_OFFENSIVE_KILLS_TOTAL",
  AvgStrongholdOffensiveKillsPerObjective = "AVG_STRONGHOLD_OFFENSIVE_KILLS_PER_OBJECTIVE",
  StrongholdDefensiveKills = "STRONGHOLD_DEFENSIVE_KILLS_TOTAL",
  AvgStrongholdDefensiveKillsPerObjective = "AVG_STRONGHOLD_DEFENSIVE_KILLS_PER_OBJECTIVE",
  HillScoringTicks = "HILL_SCORING_TICKS_TOTAL",
  AvgHillScoringTicksPerObjective = "AVG_HILL_SCORING_TICKS_PER_OBJECTIVE",
  HillOffensiveKills = "HILL_OFFENSIVE_KILLS_TOTAL",
  AvgHillOffensiveKillsPerObjective = "AVG_HILL_OFFENSIVE_KILLS_PER_OBJECTIVE",
  HillDefensiveKills = "HILL_DEFENSIVE_KILLS_TOTAL",
  AvgHillDefensiveKillsPerObjective = "AVG_HILL_DEFENSIVE_KILLS_PER_OBJECTIVE",
  BallScoringTicks = "BALL_SCORING_TICKS_TOTAL",
  AvgBallScoringTicksPerObjective = "AVG_BALL_SCORING_TICKS_PER_OBJECTIVE",
  BallGrabs = "BALL_GRABS_TOTAL",
  AvgBallGrabsPerObjective = "AVG_BALL_GRABS_PER_OBJECTIVE",
  BallCarriersKilled = "BALL_CARRIERS_KILLED_TOTAL",
  AvgBallCarriersKilledPerObjective = "AVG_BALL_CARRIERS_KILLED_PER_OBJECTIVE",
  BallCarrierKills = "BALL_CARRIER_KILLS_TOTAL",
  AvgBallCarrierKillsPerObjective = "AVG_BALL_CARRIER_KILLS_PER_OBJECTIVE",
}

/**
 * Stat family groups leaderboard metrics for the two-step Discord picker (family -> aggregation).
 * Every `LeaderboardMetric` belongs to exactly one family; families with one or more valid
 * aggregations expose the aggregation selector, while families with no valid aggregations are
 * treated as having an implicit aggregation and skip that selector.
 */
export enum LeaderboardMetricFamily {
  SeriesPlayed = "SERIES_PLAYED",
  SeriesWins = "SERIES_WINS",
  GamesPlayed = "GAMES_PLAYED",
  GameWins = "GAME_WINS",
  MedalPoints = "MEDAL_POINTS",
  MythicMedals = "MYTHIC_MEDALS",
  ObjectiveTime = "OBJECTIVE_TIME",
  ObjectiveTeamContribution = "OBJECTIVE_TEAM_CONTRIBUTION",
  ObjectiveGameContribution = "OBJECTIVE_GAME_CONTRIBUTION",
  WinPercentage = "WIN_PERCENTAGE",
  PersonalScore = "PERSONAL_SCORE",
  Kills = "KILLS",
  Deaths = "DEATHS",
  Assists = "ASSISTS",
  HeadshotKills = "HEADSHOT_KILLS",
  ShotsHit = "SHOTS_HIT",
  ShotsFired = "SHOTS_FIRED",
  DamageDealt = "DAMAGE_DEALT",
  DamageTaken = "DAMAGE_TAKEN",
  Kda = "KDA",
  Accuracy = "ACCURACY",
  DamageRatio = "DAMAGE_RATIO",
  AvgLifeSeconds = "AVG_LIFE_SECONDS",
  AvgDamagePerLife = "AVG_DAMAGE_PER_LIFE",
  FlagCaptures = "FLAG_CAPTURES",
  FlagCaptureAssists = "FLAG_CAPTURE_ASSISTS",
  FlagGrabs = "FLAG_GRABS",
  FlagReturns = "FLAG_RETURNS",
  FlagSecures = "FLAG_SECURES",
  FlagSteals = "FLAG_STEALS",
  FlagCarriersKilled = "FLAG_CARRIERS_KILLED",
  FlagReturnersKilled = "FLAG_RETURNERS_KILLED",
  FlagCarrierKills = "FLAG_CARRIER_KILLS",
  FlagReturnerKills = "FLAG_RETURNER_KILLS",
  StrongholdCaptures = "STRONGHOLD_CAPTURES",
  StrongholdSecures = "STRONGHOLD_SECURES",
  StrongholdOffensiveKills = "STRONGHOLD_OFFENSIVE_KILLS",
  StrongholdDefensiveKills = "STRONGHOLD_DEFENSIVE_KILLS",
  HillScoringTicks = "HILL_SCORING_TICKS",
  HillOffensiveKills = "HILL_OFFENSIVE_KILLS",
  HillDefensiveKills = "HILL_DEFENSIVE_KILLS",
  BallScoringTicks = "BALL_SCORING_TICKS",
  BallGrabs = "BALL_GRABS",
  BallCarriersKilled = "BALL_CARRIERS_KILLED",
  BallCarrierKills = "BALL_CARRIER_KILLS",
}

export const LEADERBOARD_METRIC_FAMILIES_IN_DISPLAY_ORDER: readonly LeaderboardMetricFamily[] = [
  LeaderboardMetricFamily.WinPercentage,
  LeaderboardMetricFamily.SeriesPlayed,
  LeaderboardMetricFamily.SeriesWins,
  LeaderboardMetricFamily.GamesPlayed,
  LeaderboardMetricFamily.GameWins,
  LeaderboardMetricFamily.PersonalScore,
  LeaderboardMetricFamily.Kills,
  LeaderboardMetricFamily.Deaths,
  LeaderboardMetricFamily.Assists,
  LeaderboardMetricFamily.Kda,
  LeaderboardMetricFamily.HeadshotKills,
  LeaderboardMetricFamily.ShotsHit,
  LeaderboardMetricFamily.ShotsFired,
  LeaderboardMetricFamily.Accuracy,
  LeaderboardMetricFamily.DamageDealt,
  LeaderboardMetricFamily.DamageTaken,
  LeaderboardMetricFamily.ObjectiveTime,
  LeaderboardMetricFamily.DamageRatio,
  LeaderboardMetricFamily.AvgLifeSeconds,
  LeaderboardMetricFamily.AvgDamagePerLife,
  LeaderboardMetricFamily.ObjectiveTeamContribution,
  LeaderboardMetricFamily.ObjectiveGameContribution,
  LeaderboardMetricFamily.MedalPoints,
  LeaderboardMetricFamily.MythicMedals,
  LeaderboardMetricFamily.FlagCaptures,
  LeaderboardMetricFamily.FlagCaptureAssists,
  LeaderboardMetricFamily.FlagGrabs,
  LeaderboardMetricFamily.FlagReturns,
  LeaderboardMetricFamily.FlagSecures,
  LeaderboardMetricFamily.FlagSteals,
  LeaderboardMetricFamily.FlagCarriersKilled,
  LeaderboardMetricFamily.FlagReturnersKilled,
  LeaderboardMetricFamily.FlagCarrierKills,
  LeaderboardMetricFamily.FlagReturnerKills,
  LeaderboardMetricFamily.StrongholdCaptures,
  LeaderboardMetricFamily.StrongholdSecures,
  LeaderboardMetricFamily.StrongholdOffensiveKills,
  LeaderboardMetricFamily.StrongholdDefensiveKills,
  LeaderboardMetricFamily.HillScoringTicks,
  LeaderboardMetricFamily.HillOffensiveKills,
  LeaderboardMetricFamily.HillDefensiveKills,
  LeaderboardMetricFamily.BallScoringTicks,
  LeaderboardMetricFamily.BallGrabs,
  LeaderboardMetricFamily.BallCarriersKilled,
  LeaderboardMetricFamily.BallCarrierKills,
];

export enum LeaderboardMetricAggregation {
  AvgPerSeries = "AVG_PER_SERIES",
  AvgPerGame = "AVG_PER_GAME",
  Total = "TOTAL",
  AvgPerObjective = "AVG_PER_OBJECTIVE",
  TotalObjective = "TOTAL_OBJECTIVE",
}

export interface LeaderboardObjectiveMetricDescriptor {
  readonly family: LeaderboardMetricFamily;
  readonly totalMetric: LeaderboardMetric;
  readonly averageMetric: LeaderboardMetric;
  readonly category: GameVariantCategory;
  /** Key path within the persisted `ObjectiveStatsJson` payload, excluding the leading `$.`. */
  readonly statsPath: string;
  readonly label: string;
  readonly unit: string;
}

/**
 * Objective metrics rank players within a single game mode, so both aggregations divide by games of
 * that mode rather than by every game played. Only integer counters are modelled here; objective
 * durations are stored as ISO-8601 strings and remain covered by the `ObjectiveTime` family.
 */
export const LEADERBOARD_OBJECTIVE_METRIC_DESCRIPTORS: readonly LeaderboardObjectiveMetricDescriptor[] = [
  {
    family: LeaderboardMetricFamily.FlagCaptures,
    totalMetric: LeaderboardMetric.FlagCaptures,
    averageMetric: LeaderboardMetric.AvgFlagCapturesPerObjective,
    category: GameVariantCategory.MultiplayerCtf,
    statsPath: "CaptureTheFlagStats.FlagCaptures",
    label: "Flag - Captures",
    unit: "captures",
  },
  {
    family: LeaderboardMetricFamily.FlagCaptureAssists,
    totalMetric: LeaderboardMetric.FlagCaptureAssists,
    averageMetric: LeaderboardMetric.AvgFlagCaptureAssistsPerObjective,
    category: GameVariantCategory.MultiplayerCtf,
    statsPath: "CaptureTheFlagStats.FlagCaptureAssists",
    label: "Flag - Capture assists",
    unit: "assists",
  },
  {
    family: LeaderboardMetricFamily.FlagGrabs,
    totalMetric: LeaderboardMetric.FlagGrabs,
    averageMetric: LeaderboardMetric.AvgFlagGrabsPerObjective,
    category: GameVariantCategory.MultiplayerCtf,
    statsPath: "CaptureTheFlagStats.FlagGrabs",
    label: "Flag - Grabs",
    unit: "grabs",
  },
  {
    family: LeaderboardMetricFamily.FlagReturns,
    totalMetric: LeaderboardMetric.FlagReturns,
    averageMetric: LeaderboardMetric.AvgFlagReturnsPerObjective,
    category: GameVariantCategory.MultiplayerCtf,
    statsPath: "CaptureTheFlagStats.FlagReturns",
    label: "Flag - Returns",
    unit: "returns",
  },
  {
    family: LeaderboardMetricFamily.FlagSecures,
    totalMetric: LeaderboardMetric.FlagSecures,
    averageMetric: LeaderboardMetric.AvgFlagSecuresPerObjective,
    category: GameVariantCategory.MultiplayerCtf,
    statsPath: "CaptureTheFlagStats.FlagSecures",
    label: "Flag - Secures",
    unit: "secures",
  },
  {
    family: LeaderboardMetricFamily.FlagSteals,
    totalMetric: LeaderboardMetric.FlagSteals,
    averageMetric: LeaderboardMetric.AvgFlagStealsPerObjective,
    category: GameVariantCategory.MultiplayerCtf,
    statsPath: "CaptureTheFlagStats.FlagSteals",
    label: "Flag - Steals",
    unit: "steals",
  },
  {
    family: LeaderboardMetricFamily.FlagCarriersKilled,
    totalMetric: LeaderboardMetric.FlagCarriersKilled,
    averageMetric: LeaderboardMetric.AvgFlagCarriersKilledPerObjective,
    category: GameVariantCategory.MultiplayerCtf,
    statsPath: "CaptureTheFlagStats.FlagCarriersKilled",
    label: "Flag - Carriers killed",
    unit: "kills",
  },
  {
    family: LeaderboardMetricFamily.FlagReturnersKilled,
    totalMetric: LeaderboardMetric.FlagReturnersKilled,
    averageMetric: LeaderboardMetric.AvgFlagReturnersKilledPerObjective,
    category: GameVariantCategory.MultiplayerCtf,
    statsPath: "CaptureTheFlagStats.FlagReturnersKilled",
    label: "Flag - Returners killed",
    unit: "kills",
  },
  {
    family: LeaderboardMetricFamily.FlagCarrierKills,
    totalMetric: LeaderboardMetric.FlagCarrierKills,
    averageMetric: LeaderboardMetric.AvgFlagCarrierKillsPerObjective,
    category: GameVariantCategory.MultiplayerCtf,
    statsPath: "CaptureTheFlagStats.KillsAsFlagCarrier",
    label: "Flag - Kills as carrier",
    unit: "kills",
  },
  {
    family: LeaderboardMetricFamily.FlagReturnerKills,
    totalMetric: LeaderboardMetric.FlagReturnerKills,
    averageMetric: LeaderboardMetric.AvgFlagReturnerKillsPerObjective,
    category: GameVariantCategory.MultiplayerCtf,
    statsPath: "CaptureTheFlagStats.KillsAsFlagReturner",
    label: "Flag - Kills as returner",
    unit: "kills",
  },
  {
    family: LeaderboardMetricFamily.StrongholdCaptures,
    totalMetric: LeaderboardMetric.StrongholdCaptures,
    averageMetric: LeaderboardMetric.AvgStrongholdCapturesPerObjective,
    category: GameVariantCategory.MultiplayerStrongholds,
    statsPath: "ZonesStats.StrongholdCaptures",
    label: "Strongholds - Captures",
    unit: "captures",
  },
  {
    family: LeaderboardMetricFamily.StrongholdSecures,
    totalMetric: LeaderboardMetric.StrongholdSecures,
    averageMetric: LeaderboardMetric.AvgStrongholdSecuresPerObjective,
    category: GameVariantCategory.MultiplayerStrongholds,
    statsPath: "ZonesStats.StrongholdSecures",
    label: "Strongholds - Secures",
    unit: "secures",
  },
  {
    family: LeaderboardMetricFamily.StrongholdOffensiveKills,
    totalMetric: LeaderboardMetric.StrongholdOffensiveKills,
    averageMetric: LeaderboardMetric.AvgStrongholdOffensiveKillsPerObjective,
    category: GameVariantCategory.MultiplayerStrongholds,
    statsPath: "ZonesStats.StrongholdOffensiveKills",
    label: "Strongholds - Offensive kills",
    unit: "kills",
  },
  {
    family: LeaderboardMetricFamily.StrongholdDefensiveKills,
    totalMetric: LeaderboardMetric.StrongholdDefensiveKills,
    averageMetric: LeaderboardMetric.AvgStrongholdDefensiveKillsPerObjective,
    category: GameVariantCategory.MultiplayerStrongholds,
    statsPath: "ZonesStats.StrongholdDefensiveKills",
    label: "Strongholds - Defensive kills",
    unit: "kills",
  },
  {
    family: LeaderboardMetricFamily.HillScoringTicks,
    totalMetric: LeaderboardMetric.HillScoringTicks,
    averageMetric: LeaderboardMetric.AvgHillScoringTicksPerObjective,
    category: GameVariantCategory.MultiplayerKingOfTheHill,
    statsPath: "ZonesStats.StrongholdScoringTicks",
    label: "KOTH - Scoring ticks",
    unit: "ticks",
  },
  {
    family: LeaderboardMetricFamily.HillOffensiveKills,
    totalMetric: LeaderboardMetric.HillOffensiveKills,
    averageMetric: LeaderboardMetric.AvgHillOffensiveKillsPerObjective,
    category: GameVariantCategory.MultiplayerKingOfTheHill,
    statsPath: "ZonesStats.StrongholdOffensiveKills",
    label: "KOTH - Offensive kills",
    unit: "kills",
  },
  {
    family: LeaderboardMetricFamily.HillDefensiveKills,
    totalMetric: LeaderboardMetric.HillDefensiveKills,
    averageMetric: LeaderboardMetric.AvgHillDefensiveKillsPerObjective,
    category: GameVariantCategory.MultiplayerKingOfTheHill,
    statsPath: "ZonesStats.StrongholdDefensiveKills",
    label: "KOTH - Defensive kills",
    unit: "kills",
  },
  {
    family: LeaderboardMetricFamily.BallScoringTicks,
    totalMetric: LeaderboardMetric.BallScoringTicks,
    averageMetric: LeaderboardMetric.AvgBallScoringTicksPerObjective,
    category: GameVariantCategory.MultiplayerOddball,
    statsPath: "OddballStats.SkullScoringTicks",
    label: "Oddball - Scoring ticks",
    unit: "ticks",
  },
  {
    family: LeaderboardMetricFamily.BallGrabs,
    totalMetric: LeaderboardMetric.BallGrabs,
    averageMetric: LeaderboardMetric.AvgBallGrabsPerObjective,
    category: GameVariantCategory.MultiplayerOddball,
    statsPath: "OddballStats.SkullGrabs",
    label: "Oddball - Grabs",
    unit: "grabs",
  },
  {
    family: LeaderboardMetricFamily.BallCarriersKilled,
    totalMetric: LeaderboardMetric.BallCarriersKilled,
    averageMetric: LeaderboardMetric.AvgBallCarriersKilledPerObjective,
    category: GameVariantCategory.MultiplayerOddball,
    statsPath: "OddballStats.SkullCarriersKilled",
    label: "Oddball - Carriers killed",
    unit: "kills",
  },
  {
    family: LeaderboardMetricFamily.BallCarrierKills,
    totalMetric: LeaderboardMetric.BallCarrierKills,
    averageMetric: LeaderboardMetric.AvgBallCarrierKillsPerObjective,
    category: GameVariantCategory.MultiplayerOddball,
    statsPath: "OddballStats.KillsAsSkullCarrier",
    label: "Oddball - Kills as carrier",
    unit: "kills",
  },
];

const OBJECTIVE_DESCRIPTORS_BY_FAMILY = new Map<LeaderboardMetricFamily, LeaderboardObjectiveMetricDescriptor>(
  LEADERBOARD_OBJECTIVE_METRIC_DESCRIPTORS.map((descriptor) => [descriptor.family, descriptor]),
);

const OBJECTIVE_DESCRIPTORS_BY_METRIC = new Map<LeaderboardMetric, LeaderboardObjectiveMetricDescriptor>(
  LEADERBOARD_OBJECTIVE_METRIC_DESCRIPTORS.flatMap((descriptor) => [
    [descriptor.totalMetric, descriptor] as const,
    [descriptor.averageMetric, descriptor] as const,
  ]),
);

export type LeaderboardObjectiveMetricFamily =
  | LeaderboardMetricFamily.FlagCaptures
  | LeaderboardMetricFamily.FlagCaptureAssists
  | LeaderboardMetricFamily.FlagGrabs
  | LeaderboardMetricFamily.FlagReturns
  | LeaderboardMetricFamily.FlagSecures
  | LeaderboardMetricFamily.FlagSteals
  | LeaderboardMetricFamily.FlagCarriersKilled
  | LeaderboardMetricFamily.FlagReturnersKilled
  | LeaderboardMetricFamily.FlagCarrierKills
  | LeaderboardMetricFamily.FlagReturnerKills
  | LeaderboardMetricFamily.StrongholdCaptures
  | LeaderboardMetricFamily.StrongholdSecures
  | LeaderboardMetricFamily.StrongholdOffensiveKills
  | LeaderboardMetricFamily.StrongholdDefensiveKills
  | LeaderboardMetricFamily.HillScoringTicks
  | LeaderboardMetricFamily.HillOffensiveKills
  | LeaderboardMetricFamily.HillDefensiveKills
  | LeaderboardMetricFamily.BallScoringTicks
  | LeaderboardMetricFamily.BallGrabs
  | LeaderboardMetricFamily.BallCarriersKilled
  | LeaderboardMetricFamily.BallCarrierKills;

export type LeaderboardObjectiveMetric =
  | LeaderboardMetric.FlagCaptures
  | LeaderboardMetric.AvgFlagCapturesPerObjective
  | LeaderboardMetric.FlagCaptureAssists
  | LeaderboardMetric.AvgFlagCaptureAssistsPerObjective
  | LeaderboardMetric.FlagGrabs
  | LeaderboardMetric.AvgFlagGrabsPerObjective
  | LeaderboardMetric.FlagReturns
  | LeaderboardMetric.AvgFlagReturnsPerObjective
  | LeaderboardMetric.FlagSecures
  | LeaderboardMetric.AvgFlagSecuresPerObjective
  | LeaderboardMetric.FlagSteals
  | LeaderboardMetric.AvgFlagStealsPerObjective
  | LeaderboardMetric.FlagCarriersKilled
  | LeaderboardMetric.AvgFlagCarriersKilledPerObjective
  | LeaderboardMetric.FlagReturnersKilled
  | LeaderboardMetric.AvgFlagReturnersKilledPerObjective
  | LeaderboardMetric.FlagCarrierKills
  | LeaderboardMetric.AvgFlagCarrierKillsPerObjective
  | LeaderboardMetric.FlagReturnerKills
  | LeaderboardMetric.AvgFlagReturnerKillsPerObjective
  | LeaderboardMetric.StrongholdCaptures
  | LeaderboardMetric.AvgStrongholdCapturesPerObjective
  | LeaderboardMetric.StrongholdSecures
  | LeaderboardMetric.AvgStrongholdSecuresPerObjective
  | LeaderboardMetric.StrongholdOffensiveKills
  | LeaderboardMetric.AvgStrongholdOffensiveKillsPerObjective
  | LeaderboardMetric.StrongholdDefensiveKills
  | LeaderboardMetric.AvgStrongholdDefensiveKillsPerObjective
  | LeaderboardMetric.HillScoringTicks
  | LeaderboardMetric.AvgHillScoringTicksPerObjective
  | LeaderboardMetric.HillOffensiveKills
  | LeaderboardMetric.AvgHillOffensiveKillsPerObjective
  | LeaderboardMetric.HillDefensiveKills
  | LeaderboardMetric.AvgHillDefensiveKillsPerObjective
  | LeaderboardMetric.BallScoringTicks
  | LeaderboardMetric.AvgBallScoringTicksPerObjective
  | LeaderboardMetric.BallGrabs
  | LeaderboardMetric.AvgBallGrabsPerObjective
  | LeaderboardMetric.BallCarriersKilled
  | LeaderboardMetric.AvgBallCarriersKilledPerObjective
  | LeaderboardMetric.BallCarrierKills
  | LeaderboardMetric.AvgBallCarrierKillsPerObjective;

export function isObjectiveLeaderboardFamily(
  family: LeaderboardMetricFamily,
): family is LeaderboardObjectiveMetricFamily {
  return OBJECTIVE_DESCRIPTORS_BY_FAMILY.has(family);
}

export function isObjectiveLeaderboardMetric(metric: LeaderboardMetric): metric is LeaderboardObjectiveMetric {
  return OBJECTIVE_DESCRIPTORS_BY_METRIC.has(metric);
}

export function getLeaderboardObjectiveDescriptorByFamily(
  family: LeaderboardObjectiveMetricFamily,
): LeaderboardObjectiveMetricDescriptor {
  const descriptor = OBJECTIVE_DESCRIPTORS_BY_FAMILY.get(family);
  if (descriptor == null) {
    throw new Error(`Missing objective descriptor for family "${family}"`);
  }

  return descriptor;
}

export function getLeaderboardObjectiveDescriptorByMetric(
  metric: LeaderboardObjectiveMetric,
): LeaderboardObjectiveMetricDescriptor {
  const descriptor = OBJECTIVE_DESCRIPTORS_BY_METRIC.get(metric);
  if (descriptor == null) {
    throw new Error(`Missing objective descriptor for metric "${metric}"`);
  }

  return descriptor;
}

export function getLeaderboardMetricFamily(metric: LeaderboardMetric): LeaderboardMetricFamily {
  if (isObjectiveLeaderboardMetric(metric)) {
    return getLeaderboardObjectiveDescriptorByMetric(metric).family;
  }

  switch (metric) {
    case LeaderboardMetric.SeriesPlayed: {
      return LeaderboardMetricFamily.SeriesPlayed;
    }
    case LeaderboardMetric.SeriesWins: {
      return LeaderboardMetricFamily.SeriesWins;
    }
    case LeaderboardMetric.MedalPoints:
    case LeaderboardMetric.AvgMedalPointsPerSeries:
    case LeaderboardMetric.AvgMedalPointsPerGame: {
      return LeaderboardMetricFamily.MedalPoints;
    }
    case LeaderboardMetric.MythicMedals:
    case LeaderboardMetric.AvgMythicMedalsPerSeries:
    case LeaderboardMetric.AvgMythicMedalsPerGame: {
      return LeaderboardMetricFamily.MythicMedals;
    }
    case LeaderboardMetric.ObjectiveTime:
    case LeaderboardMetric.AvgObjectiveTimePerGame: {
      return LeaderboardMetricFamily.ObjectiveTime;
    }
    case LeaderboardMetric.ObjectiveTeamContribution: {
      return LeaderboardMetricFamily.ObjectiveTeamContribution;
    }
    case LeaderboardMetric.ObjectiveGameContribution: {
      return LeaderboardMetricFamily.ObjectiveGameContribution;
    }
    case LeaderboardMetric.GamesPlayed: {
      return LeaderboardMetricFamily.GamesPlayed;
    }
    case LeaderboardMetric.GameWins: {
      return LeaderboardMetricFamily.GameWins;
    }
    case LeaderboardMetric.GamesWinRate:
    case LeaderboardMetric.SeriesWinRate: {
      return LeaderboardMetricFamily.WinPercentage;
    }
    case LeaderboardMetric.PersonalScore: {
      return LeaderboardMetricFamily.PersonalScore;
    }
    case LeaderboardMetric.Kills: {
      return LeaderboardMetricFamily.Kills;
    }
    case LeaderboardMetric.Deaths: {
      return LeaderboardMetricFamily.Deaths;
    }
    case LeaderboardMetric.Assists: {
      return LeaderboardMetricFamily.Assists;
    }
    case LeaderboardMetric.HeadshotKills: {
      return LeaderboardMetricFamily.HeadshotKills;
    }
    case LeaderboardMetric.ShotsHit: {
      return LeaderboardMetricFamily.ShotsHit;
    }
    case LeaderboardMetric.ShotsFired: {
      return LeaderboardMetricFamily.ShotsFired;
    }
    case LeaderboardMetric.DamageDealt: {
      return LeaderboardMetricFamily.DamageDealt;
    }
    case LeaderboardMetric.DamageTaken: {
      return LeaderboardMetricFamily.DamageTaken;
    }
    case LeaderboardMetric.Kda: {
      return LeaderboardMetricFamily.Kda;
    }
    case LeaderboardMetric.Accuracy: {
      return LeaderboardMetricFamily.Accuracy;
    }
    case LeaderboardMetric.DamageRatio: {
      return LeaderboardMetricFamily.DamageRatio;
    }
    case LeaderboardMetric.AvgLifeSeconds: {
      return LeaderboardMetricFamily.AvgLifeSeconds;
    }
    case LeaderboardMetric.AvgDamagePerLife: {
      return LeaderboardMetricFamily.AvgDamagePerLife;
    }
    case LeaderboardMetric.AvgPersonalScorePerSeries:
    case LeaderboardMetric.AvgPersonalScorePerGame: {
      return LeaderboardMetricFamily.PersonalScore;
    }
    case LeaderboardMetric.AvgKillsPerSeries:
    case LeaderboardMetric.AvgKillsPerGame: {
      return LeaderboardMetricFamily.Kills;
    }
    case LeaderboardMetric.AvgDeathsPerSeries:
    case LeaderboardMetric.AvgDeathsPerGame: {
      return LeaderboardMetricFamily.Deaths;
    }
    case LeaderboardMetric.AvgAssistsPerSeries:
    case LeaderboardMetric.AvgAssistsPerGame: {
      return LeaderboardMetricFamily.Assists;
    }
    case LeaderboardMetric.AvgHeadshotKillsPerSeries:
    case LeaderboardMetric.AvgHeadshotKillsPerGame: {
      return LeaderboardMetricFamily.HeadshotKills;
    }
    case LeaderboardMetric.AvgShotsHitPerSeries:
    case LeaderboardMetric.AvgShotsHitPerGame: {
      return LeaderboardMetricFamily.ShotsHit;
    }
    case LeaderboardMetric.AvgShotsFiredPerSeries:
    case LeaderboardMetric.AvgShotsFiredPerGame: {
      return LeaderboardMetricFamily.ShotsFired;
    }
    case LeaderboardMetric.AvgDamageDealtPerSeries:
    case LeaderboardMetric.AvgDamageDealtPerGame: {
      return LeaderboardMetricFamily.DamageDealt;
    }
    case LeaderboardMetric.AvgDamageTakenPerSeries:
    case LeaderboardMetric.AvgDamageTakenPerGame: {
      return LeaderboardMetricFamily.DamageTaken;
    }
    default: {
      throw new UnreachableError(metric);
    }
  }
}

/**
 * Valid aggregations for a family in selector display order. The default aggregation is the final
 * entry returned by this function.
 */
export function getLeaderboardFamilyAggregations(
  family: LeaderboardMetricFamily,
): readonly LeaderboardMetricAggregation[] {
  if (isObjectiveLeaderboardFamily(family)) {
    return [LeaderboardMetricAggregation.AvgPerObjective, LeaderboardMetricAggregation.TotalObjective];
  }

  switch (family) {
    case LeaderboardMetricFamily.PersonalScore:
    case LeaderboardMetricFamily.Kills:
    case LeaderboardMetricFamily.Deaths:
    case LeaderboardMetricFamily.Assists:
    case LeaderboardMetricFamily.HeadshotKills:
    case LeaderboardMetricFamily.ShotsHit:
    case LeaderboardMetricFamily.ShotsFired:
    case LeaderboardMetricFamily.DamageDealt:
    case LeaderboardMetricFamily.DamageTaken: {
      return [
        LeaderboardMetricAggregation.AvgPerSeries,
        LeaderboardMetricAggregation.AvgPerGame,
        LeaderboardMetricAggregation.Total,
      ];
    }
    case LeaderboardMetricFamily.SeriesPlayed:
    case LeaderboardMetricFamily.SeriesWins:
    case LeaderboardMetricFamily.GamesPlayed:
    case LeaderboardMetricFamily.GameWins: {
      return [LeaderboardMetricAggregation.Total];
    }
    case LeaderboardMetricFamily.MedalPoints:
    case LeaderboardMetricFamily.MythicMedals: {
      return [
        LeaderboardMetricAggregation.AvgPerSeries,
        LeaderboardMetricAggregation.AvgPerGame,
        LeaderboardMetricAggregation.Total,
      ];
    }
    case LeaderboardMetricFamily.ObjectiveTime: {
      return [LeaderboardMetricAggregation.AvgPerGame, LeaderboardMetricAggregation.Total];
    }
    case LeaderboardMetricFamily.ObjectiveTeamContribution:
    case LeaderboardMetricFamily.ObjectiveGameContribution:
    case LeaderboardMetricFamily.Kda:
    case LeaderboardMetricFamily.Accuracy:
    case LeaderboardMetricFamily.DamageRatio:
    case LeaderboardMetricFamily.AvgLifeSeconds:
    case LeaderboardMetricFamily.AvgDamagePerLife: {
      return [LeaderboardMetricAggregation.AvgPerGame];
    }
    case LeaderboardMetricFamily.WinPercentage: {
      return [LeaderboardMetricAggregation.AvgPerSeries, LeaderboardMetricAggregation.AvgPerGame];
    }
    default: {
      throw new UnreachableError(family);
    }
  }
}

export function getDefaultLeaderboardAggregation(family: LeaderboardMetricFamily): LeaderboardMetricAggregation | null {
  const aggregations = getLeaderboardFamilyAggregations(family);
  return aggregations[aggregations.length - 1] ?? null;
}

export function getLeaderboardMetricAggregation(metric: LeaderboardMetric): LeaderboardMetricAggregation {
  if (isObjectiveLeaderboardMetric(metric)) {
    const descriptor = getLeaderboardObjectiveDescriptorByMetric(metric);
    return metric === descriptor.averageMetric
      ? LeaderboardMetricAggregation.AvgPerObjective
      : LeaderboardMetricAggregation.TotalObjective;
  }

  const family = getLeaderboardMetricFamily(metric);
  const aggregations = getLeaderboardFamilyAggregations(family);

  if (aggregations.length === 1) {
    const [aggregation] = aggregations;
    if (aggregation != null) {
      return aggregation;
    }
  }

  if (metric === LeaderboardMetric.SeriesWinRate) {
    return LeaderboardMetricAggregation.AvgPerSeries;
  }
  if (metric === LeaderboardMetric.GamesWinRate) {
    return LeaderboardMetricAggregation.AvgPerGame;
  }

  if (metric.includes("_PER_SERIES")) {
    return LeaderboardMetricAggregation.AvgPerSeries;
  }
  if (metric.includes("_PER_GAME")) {
    return LeaderboardMetricAggregation.AvgPerGame;
  }

  return LeaderboardMetricAggregation.Total;
}

export function getLeaderboardMetricFamiliesForAggregation(
  aggregation: LeaderboardMetricAggregation,
): readonly LeaderboardMetricFamily[] {
  return LEADERBOARD_METRIC_FAMILIES_IN_DISPLAY_ORDER.filter((family) =>
    getLeaderboardFamilyAggregations(family).includes(aggregation),
  );
}

function resolveAggregationMetric(
  aggregation: LeaderboardMetricAggregation | null,
  totalMetric: LeaderboardMetric,
  seriesMetric: LeaderboardMetric,
  gameMetric: LeaderboardMetric,
): LeaderboardMetric {
  if (aggregation == null) {
    throw new Error("Leaderboard aggregation is required for this metric family");
  }

  switch (aggregation) {
    case LeaderboardMetricAggregation.AvgPerSeries: {
      return seriesMetric;
    }
    case LeaderboardMetricAggregation.AvgPerGame: {
      return gameMetric;
    }
    case LeaderboardMetricAggregation.Total: {
      return totalMetric;
    }
    case LeaderboardMetricAggregation.AvgPerObjective:
    case LeaderboardMetricAggregation.TotalObjective: {
      throw new Error("Objective aggregations are not valid for this metric family");
    }
    default: {
      throw new UnreachableError(aggregation);
    }
  }
}

export function resolveLeaderboardMetric(
  family: LeaderboardMetricFamily,
  aggregation: LeaderboardMetricAggregation | null,
): LeaderboardMetric {
  const supportedAggregations = getLeaderboardFamilyAggregations(family);
  const resolvedAggregation = aggregation ?? getDefaultLeaderboardAggregation(family);

  const isUnsupportedAggregation =
    supportedAggregations.length > 0
      ? resolvedAggregation == null || !supportedAggregations.includes(resolvedAggregation)
      : aggregation != null;
  if (isUnsupportedAggregation) {
    throw new Error(`Unsupported leaderboard aggregation for family "${family}"`);
  }

  if (isObjectiveLeaderboardFamily(family)) {
    const descriptor = getLeaderboardObjectiveDescriptorByFamily(family);
    return resolvedAggregation === LeaderboardMetricAggregation.AvgPerObjective
      ? descriptor.averageMetric
      : descriptor.totalMetric;
  }

  switch (family) {
    case LeaderboardMetricFamily.SeriesPlayed: {
      return LeaderboardMetric.SeriesPlayed;
    }
    case LeaderboardMetricFamily.SeriesWins: {
      return LeaderboardMetric.SeriesWins;
    }
    case LeaderboardMetricFamily.GamesPlayed: {
      return LeaderboardMetric.GamesPlayed;
    }
    case LeaderboardMetricFamily.GameWins: {
      return LeaderboardMetric.GameWins;
    }
    case LeaderboardMetricFamily.MedalPoints: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.MedalPoints,
        LeaderboardMetric.AvgMedalPointsPerSeries,
        LeaderboardMetric.AvgMedalPointsPerGame,
      );
    }
    case LeaderboardMetricFamily.MythicMedals: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.MythicMedals,
        LeaderboardMetric.AvgMythicMedalsPerSeries,
        LeaderboardMetric.AvgMythicMedalsPerGame,
      );
    }
    case LeaderboardMetricFamily.ObjectiveTime: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.ObjectiveTime,
        LeaderboardMetric.ObjectiveTime,
        LeaderboardMetric.AvgObjectiveTimePerGame,
      );
    }
    case LeaderboardMetricFamily.ObjectiveTeamContribution: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.ObjectiveTeamContribution,
        LeaderboardMetric.ObjectiveTeamContribution,
        LeaderboardMetric.ObjectiveTeamContribution,
      );
    }
    case LeaderboardMetricFamily.ObjectiveGameContribution: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.ObjectiveGameContribution,
        LeaderboardMetric.ObjectiveGameContribution,
        LeaderboardMetric.ObjectiveGameContribution,
      );
    }
    case LeaderboardMetricFamily.PersonalScore: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.PersonalScore,
        LeaderboardMetric.AvgPersonalScorePerSeries,
        LeaderboardMetric.AvgPersonalScorePerGame,
      );
    }
    case LeaderboardMetricFamily.Kills: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.Kills,
        LeaderboardMetric.AvgKillsPerSeries,
        LeaderboardMetric.AvgKillsPerGame,
      );
    }
    case LeaderboardMetricFamily.Deaths: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.Deaths,
        LeaderboardMetric.AvgDeathsPerSeries,
        LeaderboardMetric.AvgDeathsPerGame,
      );
    }
    case LeaderboardMetricFamily.Assists: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.Assists,
        LeaderboardMetric.AvgAssistsPerSeries,
        LeaderboardMetric.AvgAssistsPerGame,
      );
    }
    case LeaderboardMetricFamily.HeadshotKills: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.HeadshotKills,
        LeaderboardMetric.AvgHeadshotKillsPerSeries,
        LeaderboardMetric.AvgHeadshotKillsPerGame,
      );
    }
    case LeaderboardMetricFamily.ShotsHit: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.ShotsHit,
        LeaderboardMetric.AvgShotsHitPerSeries,
        LeaderboardMetric.AvgShotsHitPerGame,
      );
    }
    case LeaderboardMetricFamily.ShotsFired: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.ShotsFired,
        LeaderboardMetric.AvgShotsFiredPerSeries,
        LeaderboardMetric.AvgShotsFiredPerGame,
      );
    }
    case LeaderboardMetricFamily.DamageDealt: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.DamageDealt,
        LeaderboardMetric.AvgDamageDealtPerSeries,
        LeaderboardMetric.AvgDamageDealtPerGame,
      );
    }
    case LeaderboardMetricFamily.DamageTaken: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.DamageTaken,
        LeaderboardMetric.AvgDamageTakenPerSeries,
        LeaderboardMetric.AvgDamageTakenPerGame,
      );
    }
    case LeaderboardMetricFamily.WinPercentage: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.SeriesWinRate,
        LeaderboardMetric.SeriesWinRate,
        LeaderboardMetric.GamesWinRate,
      );
    }
    case LeaderboardMetricFamily.Kda: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.Kda,
        LeaderboardMetric.Kda,
        LeaderboardMetric.Kda,
      );
    }
    case LeaderboardMetricFamily.Accuracy: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.Accuracy,
        LeaderboardMetric.Accuracy,
        LeaderboardMetric.Accuracy,
      );
    }
    case LeaderboardMetricFamily.DamageRatio: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.DamageRatio,
        LeaderboardMetric.DamageRatio,
        LeaderboardMetric.DamageRatio,
      );
    }
    case LeaderboardMetricFamily.AvgLifeSeconds: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.AvgLifeSeconds,
        LeaderboardMetric.AvgLifeSeconds,
        LeaderboardMetric.AvgLifeSeconds,
      );
    }
    case LeaderboardMetricFamily.AvgDamagePerLife: {
      return resolveAggregationMetric(
        resolvedAggregation,
        LeaderboardMetric.AvgDamagePerLife,
        LeaderboardMetric.AvgDamagePerLife,
        LeaderboardMetric.AvgDamagePerLife,
      );
    }
    default: {
      throw new UnreachableError(family);
    }
  }
}

export function getLeaderboardMetricFamilyLabel(family: LeaderboardMetricFamily): string {
  if (isObjectiveLeaderboardFamily(family)) {
    return getLeaderboardObjectiveDescriptorByFamily(family).label;
  }

  switch (family) {
    case LeaderboardMetricFamily.SeriesPlayed: {
      return "Series played";
    }
    case LeaderboardMetricFamily.SeriesWins: {
      return "Series wins";
    }
    case LeaderboardMetricFamily.GamesPlayed: {
      return "Games played";
    }
    case LeaderboardMetricFamily.GameWins: {
      return "Game wins";
    }
    case LeaderboardMetricFamily.MedalPoints: {
      return "Medals by points";
    }
    case LeaderboardMetricFamily.MythicMedals: {
      return "Mythic medals";
    }
    case LeaderboardMetricFamily.ObjectiveTime: {
      return "Objective time";
    }
    case LeaderboardMetricFamily.ObjectiveTeamContribution: {
      return "Team objective contribution";
    }
    case LeaderboardMetricFamily.ObjectiveGameContribution: {
      return "Game objective contribution";
    }
    case LeaderboardMetricFamily.WinPercentage: {
      return "Win percentage";
    }
    case LeaderboardMetricFamily.PersonalScore: {
      return "Personal score";
    }
    case LeaderboardMetricFamily.Kills: {
      return "Kills";
    }
    case LeaderboardMetricFamily.Deaths: {
      return "Deaths";
    }
    case LeaderboardMetricFamily.Assists: {
      return "Assists";
    }
    case LeaderboardMetricFamily.HeadshotKills: {
      return "Headshot kills";
    }
    case LeaderboardMetricFamily.ShotsHit: {
      return "Shots hit";
    }
    case LeaderboardMetricFamily.ShotsFired: {
      return "Shots fired";
    }
    case LeaderboardMetricFamily.DamageDealt: {
      return "Damage dealt";
    }
    case LeaderboardMetricFamily.DamageTaken: {
      return "Damage taken";
    }
    case LeaderboardMetricFamily.Kda: {
      return "KDA";
    }
    case LeaderboardMetricFamily.Accuracy: {
      return "Accuracy";
    }
    case LeaderboardMetricFamily.DamageRatio: {
      return "Damage ratio";
    }
    case LeaderboardMetricFamily.AvgLifeSeconds: {
      return "Avg life time";
    }
    case LeaderboardMetricFamily.AvgDamagePerLife: {
      return "Avg damage per life";
    }
    default: {
      throw new UnreachableError(family);
    }
  }
}

export function getLeaderboardMetricAggregationLabel(aggregation: LeaderboardMetricAggregation): string {
  const labelsByAggregation: Record<LeaderboardMetricAggregation, string> = {
    [LeaderboardMetricAggregation.AvgPerSeries]: "Avg per series",
    [LeaderboardMetricAggregation.AvgPerGame]: "Avg per game",
    [LeaderboardMetricAggregation.AvgPerObjective]: "Avg per objective game",
    [LeaderboardMetricAggregation.Total]: "Total",
    [LeaderboardMetricAggregation.TotalObjective]: "Total objective",
  };

  return labelsByAggregation[aggregation];
}
