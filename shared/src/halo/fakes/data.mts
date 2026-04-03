import type { GameVariantCategory, MatchStats, Stats } from "halo-infinite-api";

export function aFakeCoreStatsWith(overrides?: Partial<Stats["CoreStats"]>): Stats["CoreStats"] {
  return {
    Score: 50,
    PersonalScore: 6600,
    RoundsWon: 1,
    RoundsLost: 0,
    RoundsTied: 0,
    Kills: 50,
    Deaths: 44,
    Assists: 27,
    KDA: 15,
    Suicides: 0,
    Betrayals: 0,
    AverageLifeDuration: "PT38.1S",
    GrenadeKills: 6,
    HeadshotKills: 30,
    MeleeKills: 8,
    PowerWeaponKills: 0,
    ShotsFired: 712,
    ShotsHit: 371,
    Accuracy: 52.1,
    DamageDealt: 17849,
    DamageTaken: 17356,
    CalloutAssists: 10,
    VehicleDestroys: 0,
    DriverAssists: 0,
    Hijacks: 0,
    EmpAssists: 0,
    MaxKillingSpree: 6,
    Medals: [
      { NameId: 622331684, Count: 6, TotalPersonalScoreAwarded: 120 },
      { NameId: 1169571763, Count: 1, TotalPersonalScoreAwarded: 50 },
    ],
    PersonalScores: [
      { NameId: 1024030246, Count: 50, TotalPersonalScoreAwarded: 5000 },
      { NameId: 638246808, Count: 30, TotalPersonalScoreAwarded: 1500 },
    ],
    DeprecatedDamageDealt: 17849,
    DeprecatedDamageTaken: 17356,
    Spawns: 48,
    ObjectivesCompleted: 0,
    ...overrides,
  };
}

export function aFakePlayerWith(overrides?: Partial<MatchStats["Players"][0]>): MatchStats["Players"][0] {
  const basePlayer: MatchStats["Players"][0] = {
    PlayerId: "xuid(1234567890)",
    PlayerType: 1,
    BotAttributes: {},
    LastTeamId: 1,
    Outcome: 2,
    Rank: 1,
    ParticipationInfo: {
      FirstJoinedTime: "2024-11-26T11:05:39.587Z",
      LastLeaveTime: null,
      PresentAtBeginning: true,
      JoinedInProgress: false,
      LeftInProgress: false,
      PresentAtCompletion: true,
      TimePlayed: "PT8M34.25S",
      ConfirmedParticipation: null,
    },
    PlayerTeamStats: [
      {
        TeamId: 1,
        Stats: {
          CoreStats: aFakeCoreStatsWith(),
          PvpStats: { Kills: 50, Deaths: 44, Assists: 27, KDA: 15 },
        },
      },
    ],
  };

  const merged = { ...basePlayer, ...overrides };

  if (overrides?.PlayerTeamStats) {
    merged.PlayerTeamStats = overrides.PlayerTeamStats;
  } else if (overrides?.LastTeamId !== undefined && overrides.LastTeamId !== basePlayer.LastTeamId) {
    merged.PlayerTeamStats = [
      {
        TeamId: overrides.LastTeamId,
        Stats: merged.PlayerTeamStats[0]?.Stats ?? {
          CoreStats: aFakeCoreStatsWith(),
          PvpStats: { Kills: 50, Deaths: 44, Assists: 27, KDA: 15 },
        },
      },
    ];
  }

  return merged;
}

export function aFakeTeamWith(overrides?: Partial<MatchStats["Teams"][0]>): MatchStats["Teams"][0] {
  return {
    TeamId: 1,
    Outcome: 2,
    Rank: 1,
    Stats: {
      CoreStats: aFakeCoreStatsWith(),
      PvpStats: { Kills: 50, Deaths: 44, Assists: 27, KDA: 15 },
    },
    ...overrides,
  };
}

export function aFakeMatchStatsWith(overrides?: Partial<MatchStats>): MatchStats {
  return {
    MatchId: "9535b946-f30c-4a43-b852-000000slayer",
    MatchInfo: {
      StartTime: "2024-11-26T11:05:39.587Z",
      EndTime: "2024-11-26T11:14:25.091Z",
      Duration: "PT8M45.5042357S",
      LifecycleMode: 1,
      GameVariantCategory: 6,
      LevelId: "19dfcede-dcd1-45a8-8a77-2b58ce65484f",
      MapVariant: {
        AssetKind: 2,
        AssetId: "e23ea388-9bcb-4180-a0dc-fbe987751b9e",
        VersionId: "26d77007-363e-4acf-9a7c-f437a42ecda3",
      },
      UgcGameVariant: {
        AssetKind: 6,
        AssetId: "c2d20d44-8606-4669-b894-afae15b3524f",
        VersionId: "0091d411-f90d-44a7-aac3-ccc7ff2b131f",
      },
      ClearanceId: "9a38cea4-c913-41e1-b9f5-81a20945eadd",
      Playlist: null,
      PlaylistExperience: null,
      PlaylistMapModePair: null,
      SeasonId: null,
      PlayableDuration: "PT8M34.25S",
      TeamsEnabled: true,
      TeamScoringEnabled: true,
      GameplayInteraction: 1,
    },
    Teams: [aFakeTeamWith({ TeamId: 0, Rank: 2, Outcome: 3 }), aFakeTeamWith({ TeamId: 1, Rank: 1, Outcome: 2 })],
    Players: [
      aFakePlayerWith({
        PlayerId: "xuid(1111111111)",
        LastTeamId: 0,
        Rank: 3,
        PlayerTeamStats: [
          {
            TeamId: 0,
            Stats: {
              CoreStats: aFakeCoreStatsWith({ Kills: 10, Deaths: 15, Assists: 5, PersonalScore: 1500 }),
              PvpStats: { Kills: 10, Deaths: 15, Assists: 5, KDA: 1 },
            },
          },
        ],
      }),
      aFakePlayerWith({
        PlayerId: "xuid(2222222222)",
        LastTeamId: 0,
        Rank: 4,
        PlayerTeamStats: [
          {
            TeamId: 0,
            Stats: {
              CoreStats: aFakeCoreStatsWith({ Kills: 8, Deaths: 12, Assists: 3, PersonalScore: 1200 }),
              PvpStats: { Kills: 8, Deaths: 12, Assists: 3, KDA: 0.92 },
            },
          },
        ],
      }),
      aFakePlayerWith({
        PlayerId: "xuid(3333333333)",
        LastTeamId: 1,
        Rank: 1,
        PlayerTeamStats: [
          {
            TeamId: 1,
            Stats: {
              CoreStats: aFakeCoreStatsWith({ Kills: 25, Deaths: 10, Assists: 15, PersonalScore: 4000 }),
              PvpStats: { Kills: 25, Deaths: 10, Assists: 15, KDA: 4 },
            },
          },
        ],
      }),
      aFakePlayerWith({
        PlayerId: "xuid(4444444444)",
        LastTeamId: 1,
        Rank: 2,
        PlayerTeamStats: [
          {
            TeamId: 1,
            Stats: {
              CoreStats: aFakeCoreStatsWith({ Kills: 20, Deaths: 11, Assists: 12, PersonalScore: 3200 }),
              PvpStats: { Kills: 20, Deaths: 11, Assists: 12, KDA: 2.91 },
            },
          },
        ],
      }),
    ],
    ...overrides,
  } as MatchStats;
}

export function aFakeCtfStatsWith(
  overrides?: Partial<Stats<GameVariantCategory.MultiplayerCtf>["CaptureTheFlagStats"]>,
): Stats<GameVariantCategory.MultiplayerCtf> {
  return {
    CoreStats: aFakeCoreStatsWith(),
    PvpStats: { Kills: 50, Deaths: 44, Assists: 27, KDA: 15 },
    CaptureTheFlagStats: {
      FlagCaptures: 3,
      FlagCaptureAssists: 2,
      FlagCarriersKilled: 5,
      FlagGrabs: 8,
      FlagReturnersKilled: 1,
      FlagReturns: 4,
      FlagSecures: 2,
      FlagSteals: 6,
      KillsAsFlagCarrier: 7,
      KillsAsFlagReturner: 3,
      TimeAsFlagCarrier: "PT1M30S",
      ...overrides,
    },
  };
}
