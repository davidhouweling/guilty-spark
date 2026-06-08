import { describe, expect, it } from "vitest";
import type { MapAsset, MatchStats, PlaylistCsrContainer } from "halo-infinite-api";
import {
  buildMatchResultString,
  buildTeams,
  formatDisplayDateTime,
  getCsrLabel,
  getMapThumbnailUrl,
  getRankAndCsrLabels,
  getRankLabel,
} from "../match-history-helpers";

describe("formatDisplayDateTime", () => {
  it("formats a valid ISO date string into a human-readable date-time", () => {
    const result = formatDisplayDateTime("2026-01-01T12:00:00.000Z");

    expect(result).toMatch(/2026/);
    expect(result).toMatch(/1/);
  });

  it("returns 'Unknown time' for an invalid date string", () => {
    const result = formatDisplayDateTime("not-a-date");

    expect(result).toBe("Unknown time");
  });
});

describe("getMapThumbnailUrl", () => {
  function aMapAsset(filePaths: string[], prefix = "https://cdn.example.com/"): MapAsset {
    return {
      Files: {
        Prefix: prefix,
        FileRelativePaths: filePaths,
      },
    } as unknown as MapAsset;
  }

  it("returns the thumbnail URL when a thumbnail file path exists", () => {
    const asset = aMapAsset(["images/thumbnail.png", "images/hero.png"]);

    expect(getMapThumbnailUrl(asset)).toBe("https://cdn.example.com/images/thumbnail.png");
  });

  it("falls back to the hero file when no thumbnail exists", () => {
    const asset = aMapAsset(["images/hero.png"]);

    expect(getMapThumbnailUrl(asset)).toBe("https://cdn.example.com/images/hero.png");
  });

  it("returns data:, when neither thumbnail nor hero file exists", () => {
    const asset = aMapAsset(["images/other.png"]);

    expect(getMapThumbnailUrl(asset)).toBe("data:,");
  });
});

describe("buildMatchResultString", () => {
  it("returns the outcome string when matchStats is null", () => {
    expect(buildMatchResultString("Win", null)).toBe("Win");
  });

  it("formats the score from team stats", () => {
    const matchStats = {
      Teams: [{ Stats: { CoreStats: { Score: 50 } } }, { Stats: { CoreStats: { Score: 40 } } }],
    } as unknown as MatchStats;

    expect(buildMatchResultString("Win", matchStats)).toBe("Win - 50:40");
  });
});

describe("buildTeams", () => {
  it("returns empty array when matchStats is null", () => {
    expect(buildTeams(null, new Map())).toEqual([]);
  });

  it("groups human players by team and sorts alphabetically", () => {
    const matchStats = {
      Players: [
        { PlayerType: 1, LastTeamId: 0, PlayerId: "xuid(1000)" },
        { PlayerType: 1, LastTeamId: 1, PlayerId: "xuid(2000)" },
        { PlayerType: 1, LastTeamId: 0, PlayerId: "xuid(3000)" },
      ],
    } as unknown as MatchStats;

    const xuidToGamertag = new Map([
      ["1000", "Zebra"],
      ["2000", "Alpha"],
      ["3000", "Beta"],
    ]);

    const teams = buildTeams(matchStats, xuidToGamertag);

    expect(teams).toHaveLength(2);
    expect(teams[0]).toEqual(["Beta", "Zebra"]);
    expect(teams[1]).toEqual(["Alpha"]);
  });

  it("skips non-human players (PlayerType !== 1)", () => {
    const matchStats = {
      Players: [
        { PlayerType: 2, LastTeamId: 0, PlayerId: "xuid(9999)" },
        { PlayerType: 1, LastTeamId: 0, PlayerId: "xuid(1000)" },
      ],
    } as unknown as MatchStats;

    const xuidToGamertag = new Map([["1000", "Human"]]);

    const teams = buildTeams(matchStats, xuidToGamertag);

    expect(teams).toHaveLength(1);
    expect(teams[0]).toEqual(["Human"]);
  });

  it("uses *Unknown* for players not in the gamertag map", () => {
    const matchStats = {
      Players: [{ PlayerType: 1, LastTeamId: 0, PlayerId: "xuid(9999)" }],
    } as unknown as MatchStats;

    const teams = buildTeams(matchStats, new Map());

    expect(teams[0]).toEqual(["*Unknown*"]);
  });
});

describe("getRankLabel", () => {
  it("returns 'Onyx' for Onyx tier regardless of subTier", () => {
    expect(getRankLabel("Onyx", 0)).toBe("Onyx");
    expect(getRankLabel("Onyx", 5)).toBe("Onyx");
  });

  it("returns tier with 1-indexed subTier for non-Onyx tiers", () => {
    expect(getRankLabel("Gold", 0)).toBe("Gold 1");
    expect(getRankLabel("Gold", 4)).toBe("Gold 5");
    expect(getRankLabel("Platinum", 5)).toBe("Platinum 6");
  });
});

describe("getCsrLabel", () => {
  it("returns the CSR value as a string for non-negative values", () => {
    expect(getCsrLabel(0)).toBe("0");
    expect(getCsrLabel(1500)).toBe("1500");
  });

  it("returns '-' for negative values", () => {
    expect(getCsrLabel(-1)).toBe("-");
  });
});

describe("getRankAndCsrLabels", () => {
  function aContainer(
    overrides: {
      value?: number;
      measurementMatchesRemaining?: number;
      tier?: string;
      subTier?: number;
    } = {},
  ): PlaylistCsrContainer {
    return {
      Current: {
        Value: overrides.value ?? 1200,
        MeasurementMatchesRemaining: overrides.measurementMatchesRemaining ?? 0,
        Tier: overrides.tier ?? "Gold",
        SubTier: overrides.subTier ?? 4,
        TierStart: 1100,
        NextTier: "Platinum",
        NextTierStart: 1300,
        NextSubTier: 0,
        InitialMeasurementMatches: 10,
        DemotionProtectionMatchesRemaining: 0,
        InitialDemotionProtectionMatches: 0,
      },
      SeasonMax: {} as PlaylistCsrContainer["SeasonMax"],
      AllTimeMax: {} as PlaylistCsrContainer["AllTimeMax"],
    };
  }

  it("returns rank and CSR labels for a ranked player", () => {
    const result = getRankAndCsrLabels(aContainer({ value: 1200, tier: "Gold", subTier: 4 }));

    expect(result.rankLabel).toBe("Gold 5");
    expect(result.csrLabel).toBe("1200");
  });

  it("returns 'Unranked' when measurement matches remain", () => {
    const result = getRankAndCsrLabels(aContainer({ measurementMatchesRemaining: 5 }));

    expect(result.rankLabel).toBe("Unranked");
  });

  it("returns '-' for csrLabel when CSR value is negative", () => {
    const result = getRankAndCsrLabels(aContainer({ value: -1 }));

    expect(result.csrLabel).toBe("-");
  });
});
