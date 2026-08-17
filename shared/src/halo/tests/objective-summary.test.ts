import { GameVariantCategory } from "halo-infinite-api";
import { describe, expect, it } from "vitest";
import { aFakeMatchStatsWith, aFakePlayerWith, aFakeTeamWith, aFakeCoreStatsWith } from "../fakes/data";
import { getPlayerObjectiveSummary } from "../objective-summary";

describe("getPlayerObjectiveSummary", () => {
  it("aggregates objective time from objective matches and excludes slayer matches", () => {
    const playerId = "xuid(1111)";

    const ctfMatch = aFakeMatchStatsWith({
      MatchInfo: {
        ...aFakeMatchStatsWith().MatchInfo,
        GameVariantCategory: GameVariantCategory.MultiplayerCtf,
      },
      Teams: [
        aFakeTeamWith({
          TeamId: 0,
          Stats: {
            CoreStats: aFakeCoreStatsWith(),
            PvpStats: { Kills: 1, Deaths: 1, Assists: 1, KDA: 1 },
            CaptureTheFlagStats: {
              FlagCaptures: 0,
              FlagCaptureAssists: 0,
              FlagCarriersKilled: 0,
              FlagGrabs: 0,
              FlagReturnersKilled: 0,
              FlagReturns: 0,
              FlagSecures: 0,
              FlagSteals: 0,
              KillsAsFlagCarrier: 0,
              KillsAsFlagReturner: 0,
              TimeAsFlagCarrier: "PT1M0S",
            },
          },
        }),
      ],
      Players: [
        aFakePlayerWith({
          PlayerId: playerId,
          LastTeamId: 0,
          PlayerTeamStats: [
            {
              TeamId: 0,
              Stats: {
                CoreStats: aFakeCoreStatsWith(),
                PvpStats: { Kills: 1, Deaths: 1, Assists: 1, KDA: 1 },
                CaptureTheFlagStats: {
                  FlagCaptures: 0,
                  FlagCaptureAssists: 0,
                  FlagCarriersKilled: 0,
                  FlagGrabs: 0,
                  FlagReturnersKilled: 0,
                  FlagReturns: 0,
                  FlagSecures: 0,
                  FlagSteals: 0,
                  KillsAsFlagCarrier: 0,
                  KillsAsFlagReturner: 0,
                  TimeAsFlagCarrier: "PT30S",
                },
              },
            },
          ],
        }),
      ],
    });

    const slayerMatch = aFakeMatchStatsWith({
      MatchInfo: {
        ...aFakeMatchStatsWith().MatchInfo,
        GameVariantCategory: GameVariantCategory.MultiplayerSlayer,
      },
      Players: [aFakePlayerWith({ PlayerId: playerId, LastTeamId: 0 })],
    });

    const result = getPlayerObjectiveSummary([ctfMatch, slayerMatch], playerId);

    expect(result).not.toBeNull();
    expect(result?.objectiveGamesPlayed).toBe(1);
    expect(result?.objectiveTimeSeconds).toBe(30);
    expect(result?.objectiveTeamContributionGamesPlayed).toBe(1);
    expect(result?.objectiveTeamContribution).toBe(0.5);
  });

  it("keeps objective game counts for zero objective-time players", () => {
    const playerId = "xuid(1111)";

    const ctfMatch = aFakeMatchStatsWith({
      MatchInfo: {
        ...aFakeMatchStatsWith().MatchInfo,
        GameVariantCategory: GameVariantCategory.MultiplayerCtf,
      },
      Teams: [
        aFakeTeamWith({
          TeamId: 0,
          Stats: {
            CoreStats: aFakeCoreStatsWith(),
            PvpStats: { Kills: 1, Deaths: 1, Assists: 1, KDA: 1 },
            CaptureTheFlagStats: {
              FlagCaptures: 0,
              FlagCaptureAssists: 0,
              FlagCarriersKilled: 0,
              FlagGrabs: 0,
              FlagReturnersKilled: 0,
              FlagReturns: 0,
              FlagSecures: 0,
              FlagSteals: 0,
              KillsAsFlagCarrier: 0,
              KillsAsFlagReturner: 0,
              TimeAsFlagCarrier: "PT1M0S",
            },
          },
        }),
      ],
      Players: [
        aFakePlayerWith({
          PlayerId: playerId,
          LastTeamId: 0,
          PlayerTeamStats: [
            {
              TeamId: 0,
              Stats: {
                CoreStats: aFakeCoreStatsWith(),
                PvpStats: { Kills: 1, Deaths: 1, Assists: 1, KDA: 1 },
                CaptureTheFlagStats: {
                  FlagCaptures: 0,
                  FlagCaptureAssists: 0,
                  FlagCarriersKilled: 0,
                  FlagGrabs: 0,
                  FlagReturnersKilled: 0,
                  FlagReturns: 0,
                  FlagSecures: 0,
                  FlagSteals: 0,
                  KillsAsFlagCarrier: 0,
                  KillsAsFlagReturner: 0,
                  TimeAsFlagCarrier: "PT0S",
                },
              },
            },
          ],
        }),
      ],
    });

    const result = getPlayerObjectiveSummary([ctfMatch], playerId);

    expect(result).not.toBeNull();
    expect(result?.objectiveGamesPlayed).toBe(1);
    expect(result?.objectiveTimeSeconds).toBe(0);
    expect(result?.objectiveTeamContributionGamesPlayed).toBe(1);
    expect(result?.objectiveTeamContribution).toBe(0);
  });

  it("omits team-contribution averaging for matches with missing or zero denominators", () => {
    const playerId = "xuid(1111)";

    const ctfMatchWithZeroTeamTime = aFakeMatchStatsWith({
      MatchInfo: {
        ...aFakeMatchStatsWith().MatchInfo,
        GameVariantCategory: GameVariantCategory.MultiplayerCtf,
      },
      Teams: [
        aFakeTeamWith({
          TeamId: 0,
          Stats: {
            CoreStats: aFakeCoreStatsWith(),
            PvpStats: { Kills: 1, Deaths: 1, Assists: 1, KDA: 1 },
            CaptureTheFlagStats: {
              FlagCaptures: 0,
              FlagCaptureAssists: 0,
              FlagCarriersKilled: 0,
              FlagGrabs: 0,
              FlagReturnersKilled: 0,
              FlagReturns: 0,
              FlagSecures: 0,
              FlagSteals: 0,
              KillsAsFlagCarrier: 0,
              KillsAsFlagReturner: 0,
              TimeAsFlagCarrier: "PT0S",
            },
          },
        }),
      ],
      Players: [
        aFakePlayerWith({
          PlayerId: playerId,
          LastTeamId: 0,
          PlayerTeamStats: [
            {
              TeamId: 0,
              Stats: {
                CoreStats: aFakeCoreStatsWith(),
                PvpStats: { Kills: 1, Deaths: 1, Assists: 1, KDA: 1 },
                CaptureTheFlagStats: {
                  FlagCaptures: 0,
                  FlagCaptureAssists: 0,
                  FlagCarriersKilled: 0,
                  FlagGrabs: 0,
                  FlagReturnersKilled: 0,
                  FlagReturns: 0,
                  FlagSecures: 0,
                  FlagSteals: 0,
                  KillsAsFlagCarrier: 0,
                  KillsAsFlagReturner: 0,
                  TimeAsFlagCarrier: "PT25S",
                },
              },
            },
          ],
        }),
      ],
    });

    const result = getPlayerObjectiveSummary([ctfMatchWithZeroTeamTime], playerId);

    expect(result).not.toBeNull();
    expect(result?.objectiveGamesPlayed).toBe(1);
    expect(result?.objectiveTimeSeconds).toBe(25);
    expect(result?.objectiveTeamContributionGamesPlayed).toBe(0);
    expect(result?.objectiveTeamContribution).toBeNull();
  });

  it("prefers LastTeamId player stats when multiple team rows exist", () => {
    const playerId = "xuid(1111)";

    const ctfMatch = aFakeMatchStatsWith({
      MatchInfo: {
        ...aFakeMatchStatsWith().MatchInfo,
        GameVariantCategory: GameVariantCategory.MultiplayerCtf,
      },
      Teams: [
        aFakeTeamWith({
          TeamId: 0,
          Stats: {
            CoreStats: aFakeCoreStatsWith(),
            PvpStats: { Kills: 1, Deaths: 1, Assists: 1, KDA: 1 },
            CaptureTheFlagStats: {
              FlagCaptures: 0,
              FlagCaptureAssists: 0,
              FlagCarriersKilled: 0,
              FlagGrabs: 0,
              FlagReturnersKilled: 0,
              FlagReturns: 0,
              FlagSecures: 0,
              FlagSteals: 0,
              KillsAsFlagCarrier: 0,
              KillsAsFlagReturner: 0,
              TimeAsFlagCarrier: "PT1M40S",
            },
          },
        }),
        aFakeTeamWith({
          TeamId: 1,
          Stats: {
            CoreStats: aFakeCoreStatsWith(),
            PvpStats: { Kills: 1, Deaths: 1, Assists: 1, KDA: 1 },
            CaptureTheFlagStats: {
              FlagCaptures: 0,
              FlagCaptureAssists: 0,
              FlagCarriersKilled: 0,
              FlagGrabs: 0,
              FlagReturnersKilled: 0,
              FlagReturns: 0,
              FlagSecures: 0,
              FlagSteals: 0,
              KillsAsFlagCarrier: 0,
              KillsAsFlagReturner: 0,
              TimeAsFlagCarrier: "PT40S",
            },
          },
        }),
      ],
      Players: [
        aFakePlayerWith({
          PlayerId: playerId,
          LastTeamId: 1,
          PlayerTeamStats: [
            {
              TeamId: 0,
              Stats: {
                CoreStats: aFakeCoreStatsWith(),
                PvpStats: { Kills: 1, Deaths: 1, Assists: 1, KDA: 1 },
                CaptureTheFlagStats: {
                  FlagCaptures: 0,
                  FlagCaptureAssists: 0,
                  FlagCarriersKilled: 0,
                  FlagGrabs: 0,
                  FlagReturnersKilled: 0,
                  FlagReturns: 0,
                  FlagSecures: 0,
                  FlagSteals: 0,
                  KillsAsFlagCarrier: 0,
                  KillsAsFlagReturner: 0,
                  TimeAsFlagCarrier: "PT10S",
                },
              },
            },
            {
              TeamId: 1,
              Stats: {
                CoreStats: aFakeCoreStatsWith(),
                PvpStats: { Kills: 1, Deaths: 1, Assists: 1, KDA: 1 },
                CaptureTheFlagStats: {
                  FlagCaptures: 0,
                  FlagCaptureAssists: 0,
                  FlagCarriersKilled: 0,
                  FlagGrabs: 0,
                  FlagReturnersKilled: 0,
                  FlagReturns: 0,
                  FlagSecures: 0,
                  FlagSteals: 0,
                  KillsAsFlagCarrier: 0,
                  KillsAsFlagReturner: 0,
                  TimeAsFlagCarrier: "PT20S",
                },
              },
            },
          ],
        }),
      ],
    });

    const result = getPlayerObjectiveSummary([ctfMatch], playerId);

    expect(result).not.toBeNull();
    expect(result?.objectiveGamesPlayed).toBe(1);
    expect(result?.objectiveTimeSeconds).toBe(20);
    expect(result?.objectiveTeamContributionGamesPlayed).toBe(1);
    expect(result?.objectiveTeamContribution).toBe(0.5);
  });

  it("calculates team objective contribution as weighted series share", () => {
    const playerId = "xuid(1111)";

    const firstCtfMatch = aFakeMatchStatsWith({
      MatchInfo: {
        ...aFakeMatchStatsWith().MatchInfo,
        GameVariantCategory: GameVariantCategory.MultiplayerCtf,
      },
      Teams: [
        aFakeTeamWith({
          TeamId: 0,
          Stats: {
            CoreStats: aFakeCoreStatsWith(),
            PvpStats: { Kills: 1, Deaths: 1, Assists: 1, KDA: 1 },
            CaptureTheFlagStats: {
              FlagCaptures: 0,
              FlagCaptureAssists: 0,
              FlagCarriersKilled: 0,
              FlagGrabs: 0,
              FlagReturnersKilled: 0,
              FlagReturns: 0,
              FlagSecures: 0,
              FlagSteals: 0,
              KillsAsFlagCarrier: 0,
              KillsAsFlagReturner: 0,
              TimeAsFlagCarrier: "PT1M0S",
            },
          },
        }),
      ],
      Players: [
        aFakePlayerWith({
          PlayerId: playerId,
          LastTeamId: 0,
          PlayerTeamStats: [
            {
              TeamId: 0,
              Stats: {
                CoreStats: aFakeCoreStatsWith(),
                PvpStats: { Kills: 1, Deaths: 1, Assists: 1, KDA: 1 },
                CaptureTheFlagStats: {
                  FlagCaptures: 0,
                  FlagCaptureAssists: 0,
                  FlagCarriersKilled: 0,
                  FlagGrabs: 0,
                  FlagReturnersKilled: 0,
                  FlagReturns: 0,
                  FlagSecures: 0,
                  FlagSteals: 0,
                  KillsAsFlagCarrier: 0,
                  KillsAsFlagReturner: 0,
                  TimeAsFlagCarrier: "PT30S",
                },
              },
            },
          ],
        }),
      ],
    });

    const secondCtfMatch = aFakeMatchStatsWith({
      MatchInfo: {
        ...aFakeMatchStatsWith().MatchInfo,
        GameVariantCategory: GameVariantCategory.MultiplayerCtf,
      },
      Teams: [
        aFakeTeamWith({
          TeamId: 0,
          Stats: {
            CoreStats: aFakeCoreStatsWith(),
            PvpStats: { Kills: 1, Deaths: 1, Assists: 1, KDA: 1 },
            CaptureTheFlagStats: {
              FlagCaptures: 0,
              FlagCaptureAssists: 0,
              FlagCarriersKilled: 0,
              FlagGrabs: 0,
              FlagReturnersKilled: 0,
              FlagReturns: 0,
              FlagSecures: 0,
              FlagSteals: 0,
              KillsAsFlagCarrier: 0,
              KillsAsFlagReturner: 0,
              TimeAsFlagCarrier: "PT2M0S",
            },
          },
        }),
      ],
      Players: [
        aFakePlayerWith({
          PlayerId: playerId,
          LastTeamId: 0,
          PlayerTeamStats: [
            {
              TeamId: 0,
              Stats: {
                CoreStats: aFakeCoreStatsWith(),
                PvpStats: { Kills: 1, Deaths: 1, Assists: 1, KDA: 1 },
                CaptureTheFlagStats: {
                  FlagCaptures: 0,
                  FlagCaptureAssists: 0,
                  FlagCarriersKilled: 0,
                  FlagGrabs: 0,
                  FlagReturnersKilled: 0,
                  FlagReturns: 0,
                  FlagSecures: 0,
                  FlagSteals: 0,
                  KillsAsFlagCarrier: 0,
                  KillsAsFlagReturner: 0,
                  TimeAsFlagCarrier: "PT30S",
                },
              },
            },
          ],
        }),
      ],
    });

    const result = getPlayerObjectiveSummary([firstCtfMatch, secondCtfMatch], playerId);

    expect(result).not.toBeNull();
    expect(result?.objectiveGamesPlayed).toBe(2);
    expect(result?.objectiveTimeSeconds).toBe(60);
    expect(result?.objectiveTeamContributionGamesPlayed).toBe(2);
    expect(result?.objectiveTeamContribution).toBeCloseTo(1 / 3);
  });
});
