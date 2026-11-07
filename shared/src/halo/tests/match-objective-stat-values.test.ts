import { GameVariantCategory } from "halo-infinite-api";
import type { Stats } from "halo-infinite-api";
import { describe, expect, it } from "vitest";
import { aFakeCoreStatsWith, aFakeCtfStatsWith } from "../fakes/data";
import { getMatchObjectiveStatValues } from "../match-objective-stat-values";
import { StatsValueSortBy } from "../stat-formatting";

const stats = {
  ...aFakeCtfStatsWith({ FlagCaptures: 3, TimeAsFlagCarrier: "PT90S" }),
  OddballStats: {
    KillsAsSkullCarrier: 0,
    LongestTimeAsSkullCarrier: "PT38S",
    SkullCarriersKilled: 0,
    SkullGrabs: 0,
    TimeAsSkullCarrier: "PT123S",
    SkullScoringTicks: 0,
  },
  ZonesStats: {
    StrongholdCaptures: 1,
    StrongholdDefensiveKills: 4,
    StrongholdOffensiveKills: 3,
    StrongholdSecures: 2,
    StrongholdOccupationTime: "PT80S",
    StrongholdScoringTicks: 39,
  },
  ExtractionStats: {
    SuccessfulExtractions: 1,
    ExtractionInitiationsCompleted: 2,
    ExtractionInitiationsDenied: 3,
    ExtractionConversionsCompleted: 4,
    ExtractionConversionsDenied: 5,
  },
  EliminationStats: {
    Eliminations: 1,
    EliminationAssists: 2,
    AlliesRevived: 3,
    RoundsSurvived: 4,
    TimesRevivedByAlly: 5,
    EnemyRevivesDenied: 6,
    Executions: 0,
    KillsAsLastPlayerStanding: 0,
    LastPlayersStandingKilled: 0,
  },
  PveStats: {
    Kills: 0,
    Deaths: 0,
    Assists: 0,
    KDA: 0,
    MarineKills: 0,
    BossKills: 7,
    HunterKills: 8,
    EliteKills: 9,
    JackalKills: 10,
    GruntKills: 11,
    BruteKills: 12,
    SentinelKills: 13,
    SkimmerKills: 14,
  },
  InfectionSTats: {
    AlphasKilled: 1,
    InfectedKilled: 2,
    KillsAsLastSpartanStanding: 3,
    RoundsSurvivedAsSpartan: 4,
    TimeAsLastSpartanStanding: "PT80S",
    SpartansInfected: 5,
    SpartansInfectedAsAlpha: 6,
    LastSpartansStandingInfected: 0,
    RoundsAsAlpha: 0,
    RoundsAsLastSpartanStanding: 0,
    RoundsFinishedAsInfected: 0,
    RoundsSurvivedAsLastSpartanStanding: 0,
  },
  StockpileStats: {
    PowerSeedsDeposited: 1,
    PowerSeedsStolen: 2,
    KillsAsPowerSeedCarrier: 3,
    PowerSeedCarriersKilled: 4,
    TimeAsPowerSeedCarrier: "PT80S",
    TimeAsPowerSeedDriver: "PT35S",
  },
  VipStats: {
    VipKills: 1,
    VipAssists: 2,
    KillsAsVip: 3,
    TimesSelectedAsVip: 4,
    MaxKillingSpreeAsVip: 5,
    LongestTimeAsVip: "PT61S",
    TimeAsVip: "PT150S",
  },
} satisfies Stats<GameVariantCategory.MultiplayerCtf> &
  Stats<GameVariantCategory.MultiplayerOddball> &
  Stats<GameVariantCategory.MultiplayerStrongholds> &
  Stats<GameVariantCategory.MultiplayerKingOfTheHill> &
  Stats<GameVariantCategory.MultiplayerExtraction> &
  Stats<GameVariantCategory.MultiplayerElimination> &
  Stats<GameVariantCategory.MultiplayerFirefight> &
  Stats<GameVariantCategory.MultiplayerInfection> &
  Stats<GameVariantCategory.MultiplayerStockpile> &
  Stats<GameVariantCategory.MultiplayerVIP>;

const elimination: [string, number][] = [
  ["Eliminations", 1],
  ["Elimination assists", 2],
  ["Allies revived", 3],
  ["Rounds Survived", 4],
  ["Times revived by ally", 5],
  ["Enemy revives denied", 6],
];

describe("getMatchObjectiveStatValues", () => {
  it.each([
    [GameVariantCategory.MultiplayerSlayer, []],
    [GameVariantCategory.MultiplayerAttrition, []],
    [GameVariantCategory.MultiplayerFiesta, []],
    [GameVariantCategory.MultiplayerTotalControl, []],
    [GameVariantCategory.MultiplayerEscalation, []],
    [GameVariantCategory.MultiplayerGrifball, []],
    [GameVariantCategory.MultiplayerLandGrab, []],
    [GameVariantCategory.MultiplayerMinigame, []],
    // Unknown numeric categories can occur in older persisted data.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-assignment
    [999 as GameVariantCategory, []],
    [
      GameVariantCategory.MultiplayerCtf,
      [
        ["Captures", 3],
        ["Captures assists", 2],
        ["Carrier time", 90],
        ["Steals", 6],
        ["Grabs", 8],
        ["Secures", 2],
        ["Returns", 4],
        ["Carriers killed", 5],
        ["Returners killed", 3],
        ["Kills as returner", 3],
      ],
    ],
    [GameVariantCategory.MultiplayerElimination, elimination],
    [
      GameVariantCategory.MultiplayerFirefight,
      [
        ...elimination,
        ["Boss kills", 7],
        ["Hunter kills", 8],
        ["Elite kills", 9],
        ["Jackal kills", 10],
        ["Grunt kills", 11],
        ["Brute kills", 12],
        ["Sentinel kills", 13],
        ["Skimmer kills", 14],
      ],
    ],
    [
      GameVariantCategory.MultiplayerExtraction,
      [
        ["Successful extractions", 1],
        ["Initiations completed", 2],
        ["Initiations denied", 3],
        ["Conversions completed", 4],
        ["Conversions denied", 5],
      ],
    ],
    [
      GameVariantCategory.MultiplayerInfection,
      [
        ["Alphas killed", 1],
        ["Infected killed", 2],
        ["Kills as last spartan standing", 3],
        ["Rounds survived as spartan", 4],
        ["Time as last spartan standing", 80],
        ["Spartans infected", 5],
        ["Spartans infected as alpha", 6],
      ],
    ],
    [
      GameVariantCategory.MultiplayerKingOfTheHill,
      [
        ["Scoring ticks", 39],
        ["Occupation time", 80],
        ["Offensive kills", 3],
        ["Defensive kills", 4],
      ],
    ],
    [
      GameVariantCategory.MultiplayerOddball,
      [
        ["Total time as carrier", 123],
        ["Longest time as carrier", 38],
      ],
    ],
    [
      GameVariantCategory.MultiplayerStockpile,
      [
        ["Power seeds deposited", 1],
        ["Power seeds stolen", 2],
        ["Kills as power seed carrier", 3],
        ["Power seed carriers killed", 4],
        ["Time as power seed carrier", 80],
        ["Time as power seed driver", 35],
      ],
    ],
    [
      GameVariantCategory.MultiplayerStrongholds,
      [
        ["Captures", 1],
        ["Occupation time", 80],
        ["Secures", 2],
        ["Offensive kills", 3],
        ["Defensive kills", 4],
      ],
    ],
    [
      GameVariantCategory.MultiplayerVIP,
      [
        ["VIP kills", 1],
        ["VIP Assists", 2],
        ["Kills as VIP", 3],
        ["Times selected as VIP", 4],
        ["Max killing spree as VIP", 5],
        ["Longest Time as VIP", 61],
        ["Time as VIP", 150],
      ],
    ],
  ])("returns the numeric objectives for category %s", (category, expected) => {
    const result = getMatchObjectiveStatValues(stats, category);

    expect([...result]).toEqual(
      expected.map(([key, value]) => [
        key,
        { value, sortBy: key === "Times revived by ally" ? StatsValueSortBy.ASC : StatsValueSortBy.DESC },
      ]),
    );
  });

  it.each([
    [GameVariantCategory.MultiplayerCtf, "CaptureTheFlagStats"],
    [GameVariantCategory.MultiplayerElimination, "EliminationStats"],
    [GameVariantCategory.MultiplayerExtraction, "ExtractionStats"],
    [GameVariantCategory.MultiplayerFirefight, "EliminationStats and PveStats"],
    [GameVariantCategory.MultiplayerInfection, "InfectionSTats"],
    [GameVariantCategory.MultiplayerKingOfTheHill, "ZonesStats"],
    [GameVariantCategory.MultiplayerOddball, "OddballStats"],
    [GameVariantCategory.MultiplayerStockpile, "StockpileStats"],
    [GameVariantCategory.MultiplayerStrongholds, "ZonesStats"],
    [GameVariantCategory.MultiplayerVIP, "VipStats"],
  ])("rejects category %s without %s", (category, required) => {
    expect(() => getMatchObjectiveStatValues({ CoreStats: aFakeCoreStatsWith() }, category)).toThrow(required);
  });

  it("rejects Firefight with elimination stats but no PveStats", () => {
    const withoutPve: Stats<GameVariantCategory.MultiplayerElimination> = {
      CoreStats: stats.CoreStats,
      PvpStats: stats.PvpStats,
      EliminationStats: stats.EliminationStats,
    };
    expect(() => getMatchObjectiveStatValues(withoutPve, GameVariantCategory.MultiplayerFirefight)).toThrow(
      "EliminationStats and PveStats",
    );
  });

  it.each([null, undefined])("rejects an objective subobject that is %s", (value) => {
    const invalid = { ...stats, OddballStats: value };
    expect(() => getMatchObjectiveStatValues(invalid, GameVariantCategory.MultiplayerOddball)).toThrow(
      "Oddball stats require OddballStats",
    );
  });
});
