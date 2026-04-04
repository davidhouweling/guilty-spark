import { describe, it, expect } from "vitest";
import {
  getCtfObjectiveStats,
  getEmptyObjectiveStats,
  getEliminationObjectiveStats,
  getExtractionObjectiveStats,
} from "../objective-stats";
import { StatsValueSortBy } from "../stat-formatting";
import { getDurationInSeconds } from "../duration";
import { aFakeCtfStatsWith } from "../fakes/data";

describe("getEmptyObjectiveStats", () => {
  it("returns an empty map", () => {
    const result = getEmptyObjectiveStats();
    expect(result.size).toBe(0);
  });
});

describe("getCtfObjectiveStats", () => {
  it("maps flag captures", () => {
    const stats = aFakeCtfStatsWith({ FlagCaptures: 3 });

    const result = getCtfObjectiveStats(stats);

    expect(result.get("Captures")?.value).toBe(3);
    expect(result.get("Captures")?.sortBy).toBe(StatsValueSortBy.DESC);
  });

  it("maps flag capture assists", () => {
    const stats = aFakeCtfStatsWith({ FlagCaptureAssists: 2 });

    const result = getCtfObjectiveStats(stats);

    expect(result.get("Captures assists")?.value).toBe(2);
  });

  it("maps carrier time as duration in seconds", () => {
    const stats = aFakeCtfStatsWith({ TimeAsFlagCarrier: "PT1M30S" });

    const result = getCtfObjectiveStats(stats);

    expect(result.get("Carrier time")?.value).toBe(getDurationInSeconds("PT1M30S"));
    expect(result.get("Carrier time")?.sortBy).toBe(StatsValueSortBy.DESC);
  });

  it("includes display value for carrier time", () => {
    const stats = aFakeCtfStatsWith({ TimeAsFlagCarrier: "PT1M30S" });

    const result = getCtfObjectiveStats(stats);

    expect(result.get("Carrier time")?.display).toBeTruthy();
  });

  it("maps flag grabs", () => {
    const stats = aFakeCtfStatsWith({ FlagGrabs: 8 });

    const result = getCtfObjectiveStats(stats);

    expect(result.get("Grabs")?.value).toBe(8);
  });

  it("maps flag returns", () => {
    const stats = aFakeCtfStatsWith({ FlagReturns: 4 });

    const result = getCtfObjectiveStats(stats);

    expect(result.get("Returns")?.value).toBe(4);
  });

  it("maps flag carriers killed", () => {
    const stats = aFakeCtfStatsWith({ FlagCarriersKilled: 5 });

    const result = getCtfObjectiveStats(stats);

    expect(result.get("Carriers killed")?.value).toBe(5);
  });

  it("produces same values for pages (no locale) and api (with locale)", () => {
    const stats = aFakeCtfStatsWith({ FlagCaptures: 3, FlagGrabs: 8 });

    const pagesResult = getCtfObjectiveStats(stats);
    const apiResult = getCtfObjectiveStats(stats, "en-US");

    expect(pagesResult.get("Captures")?.value).toBe(apiResult.get("Captures")?.value);
    expect(pagesResult.get("Grabs")?.value).toBe(apiResult.get("Grabs")?.value);
    expect(pagesResult.get("Carrier time")?.value).toBe(apiResult.get("Carrier time")?.value);
  });
});

describe("getEliminationObjectiveStats", () => {
  it("maps eliminations", () => {
    const stats = {
      CoreStats: {} as never,
      PvpStats: {} as never,
      EliminationStats: {
        Eliminations: 12,
        EliminationAssists: 3,
        AlliesRevived: 2,
        RoundsSurvived: 5,
        TimesRevivedByAlly: 1,
        EnemyRevivesDenied: 4,
        Executions: 2,
        KillsAsLastPlayerStanding: 3,
        LastPlayersStandingKilled: 1,
      },
    } as never;

    const result = getEliminationObjectiveStats(stats);

    expect(result.get("Eliminations")?.value).toBe(12);
    expect(result.get("Elimination assists")?.value).toBe(3);
    expect(result.get("Allies revived")?.value).toBe(2);
    expect(result.get("Rounds Survived")?.value).toBe(5);
    expect(result.get("Times revived by ally")?.value).toBe(1);
    expect(result.get("Enemy revives denied")?.value).toBe(4);
  });

  it("sorts times revived by ally ascending", () => {
    const stats = {
      CoreStats: {} as never,
      PvpStats: {} as never,
      EliminationStats: {
        Eliminations: 0,
        EliminationAssists: 0,
        AlliesRevived: 0,
        RoundsSurvived: 0,
        TimesRevivedByAlly: 0,
        EnemyRevivesDenied: 0,
        Executions: 0,
        KillsAsLastPlayerStanding: 0,
        LastPlayersStandingKilled: 0,
      },
    } as never;

    const result = getEliminationObjectiveStats(stats);

    expect(result.get("Times revived by ally")?.sortBy).toBe(StatsValueSortBy.ASC);
  });
});

describe("getExtractionObjectiveStats", () => {
  const baseStats = {
    CoreStats: {} as never,
    PvpStats: {} as never,
    ExtractionStats: {
      SuccessfulExtractions: 3,
      ExtractionInitiationsCompleted: 5,
      ExtractionInitiationsDenied: 2,
      ExtractionConversionsCompleted: 4,
      ExtractionConversionsDenied: 1,
    },
  } as never;

  it("uses short labels by default (pages variant)", () => {
    const result = getExtractionObjectiveStats(baseStats);

    expect(result.has("Initiations completed")).toBe(true);
    expect(result.has("Initiations denied")).toBe(true);
    expect(result.has("Extraction initiations completed")).toBe(false);
  });

  it("uses prefixed labels when includeExtractionPrefixInLabels is true (api variant)", () => {
    const result = getExtractionObjectiveStats(baseStats, { includeExtractionPrefixInLabels: true });

    expect(result.has("Extraction initiations completed")).toBe(true);
    expect(result.has("Extraction initiations denied")).toBe(true);
    expect(result.has("Initiations completed")).toBe(false);
  });

  it("produces same values regardless of label prefix option", () => {
    const pagesResult = getExtractionObjectiveStats(baseStats);
    const apiResult = getExtractionObjectiveStats(baseStats, { includeExtractionPrefixInLabels: true });

    expect(pagesResult.get("Initiations completed")?.value).toBe(
      apiResult.get("Extraction initiations completed")?.value,
    );
    expect(pagesResult.get("Initiations denied")?.value).toBe(apiResult.get("Extraction initiations denied")?.value);
  });
});
