import { LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import type { PlayerCompareResponse } from "@guilty-spark/shared/contracts/stats/player";
import type { PlayerCompareService } from "../player-compare-types";

type PlayerCompareStats = NonNullable<PlayerCompareResponse["players"][number]["stats"]>;

export function createFakePlayerCompareStats(
  gamertag: string,
  xboxXuid: string,
): PlayerCompareStats {
  return {
    XboxXuid: xboxXuid,
    DiscordUserId: null,
    Gamertag: gamertag,
    SeriesPlayed: 3,
    SeriesWins: 2,
    GamesPlayed: 12,
    GameWins: 8,
    PersonalScore: 12000,
    AvgPersonalScorePerGame: 1000,
    Kills: 100,
    AvgKillsPerGame: 8.33,
    Deaths: 80,
    AvgDeathsPerGame: 6.67,
    Assists: 40,
    AvgAssistsPerGame: 3.33,
    HeadshotKills: 30,
    AvgHeadshotKillsPerGame: 2.5,
    ShotsHit: 500,
    AvgShotsHitPerGame: 41.67,
    ShotsFired: 1000,
    AvgShotsFiredPerGame: 83.33,
    DamageDealt: 20000,
    AvgDamageDealtPerGame: 1666.67,
    DamageTaken: 18000,
    AvgDamageTakenPerGame: 1500,
    Kda: 1.75,
    Accuracy: 50,
    DamageRatio: 1.11,
    AvgLifeSeconds: 45,
    AvgDamagePerLife: 200,
    MedalCount: 50,
    MedalPoints: 500,
    MythicMedalCount: 1,
    ObjectiveGamesPlayed: 8,
    ObjectiveTimeSeconds: 300,
    AvgObjectiveTimeSeconds: 37.5,
    ObjectiveTeamContribution: 0.25,
    ObjectiveTeamContributionGamesPlayed: 8,
    CtfGamesPlayed: 2,
    StrongholdGamesPlayed: 2,
    HillGamesPlayed: 2,
    BallGamesPlayed: 2,
    FlagCaptures: 2,
    FlagCaptureAssists: 1,
    FlagGrabs: 3,
    FlagReturns: 2,
    FlagSecures: 1,
    FlagSteals: 1,
    FlagCarriersKilled: 2,
    FlagReturnersKilled: 1,
    FlagCarrierKills: 1,
    FlagReturnerKills: 1,
    StrongholdCaptures: 3,
    StrongholdSecures: 2,
    StrongholdOffensiveKills: 4,
    StrongholdDefensiveKills: 3,
    HillScoringTicks: 20,
    HillOffensiveKills: 2,
    HillDefensiveKills: 2,
    BallScoringTicks: 25,
    BallGrabs: 2,
    BallCarriersKilled: 1,
    BallCarrierKills: 1,
  };
}

const defaultResponse: PlayerCompareResponse = {
  players: [
    { player: { xboxXuid: "xuid-1", gamertag: "Alpha" }, stats: createFakePlayerCompareStats("Alpha", "xuid-1"), ranks: {} },
    { player: { xboxXuid: "xuid-2", gamertag: "Bravo" }, stats: createFakePlayerCompareStats("Bravo", "xuid-2"), ranks: {} },
  ],
  servers: [
    {
      guildId: "guild-1",
      guildName: "Test Server",
      gamesPlayed: 12,
      queueOptions: [{ channelId: "queue-1", label: "#arena" }],
    },
  ],
  selectedGuildId: "guild-1",
  selectedGuildName: "Test Server",
  queueOptions: [{ channelId: "queue-1", label: "#arena" }],
  window: LeaderboardWindow.ThreeMonths,
  resetAt: null,
  minGamesPlayed: 5,
  totalPlayers: 10,
  pairSummaries: [],
};

export function aFakePlayerCompareServiceWith(
  responseOverrides: Partial<PlayerCompareResponse> = {},
): PlayerCompareService {
  const response = { ...defaultResponse, ...responseOverrides };
  return {
    getPlayerCompare: async (): Promise<PlayerCompareResponse> => await Promise.resolve(response),
  };
}
