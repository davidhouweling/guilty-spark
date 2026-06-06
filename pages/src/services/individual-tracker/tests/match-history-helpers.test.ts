import { describe, expect, it } from "vitest";
import type { MapAsset, MatchStats } from "halo-infinite-api";
import {
  buildMatchResultString,
  buildTeams,
  formatDisplayDateTime,
  getMapThumbnailUrl,
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
