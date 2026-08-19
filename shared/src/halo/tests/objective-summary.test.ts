import { GameVariantCategory } from "halo-infinite-api";
import { describe, expect, it } from "vitest";
import { aFakeMatchStatsWith, aFakePlayerWith, aFakeTeamWith, aFakeCoreStatsWith } from "../fakes/data";
import { getPlayerObjectiveStats, getPlayerObjectiveSummary } from "../objective-summary";
import { StatsValueSortBy } from "../stat-formatting";

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

describe("getPlayerObjectiveStats", () => {
  it("returns an empty collection when the player has no objective games", () => {
    const playerId = "xuid(1111)";
    const slayerMatch = aFakeMatchStatsWith({
      MatchInfo: {
        ...aFakeMatchStatsWith().MatchInfo,
        GameVariantCategory: GameVariantCategory.MultiplayerSlayer,
      },
      Players: [aFakePlayerWith({ PlayerId: playerId, LastTeamId: 0 })],
    });

    const result = getPlayerObjectiveStats([slayerMatch], playerId);

    expect(result.size).toBe(0);
  });

  it("returns Objective time and Team objective contribution as separate stat values", () => {
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
                  TimeAsFlagCarrier: "PT1M0S",
                },
              },
            },
          ],
        }),
      ],
    });

    const result = getPlayerObjectiveStats([ctfMatch], playerId);

    expect(result.get("Objective time")).toEqual({ value: 60, sortBy: StatsValueSortBy.DESC, display: "1m" });
    expect(result.get("Team objective contribution")).toEqual({
      value: 1,
      sortBy: StatsValueSortBy.DESC,
      isComparable: true,
      display: "100%",
    });
  });

  it("shows n/a for team contribution when the team denominator is unavailable", () => {
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

    const result = getPlayerObjectiveStats([ctfMatch], playerId);

    expect(result.get("Objective time")?.display).toBe("25s");
    expect(result.get("Team objective contribution")?.isComparable).toBe(false);
    expect(result.get("Team objective contribution")?.display).toBe("n/a");
  });
});
