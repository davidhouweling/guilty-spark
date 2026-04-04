import { describe, it, expect } from "vitest";
import { getPlayerSlayerStats } from "../slayer-stats";
import { StatsValueSortBy } from "../stat-formatting";
import { aFakeCoreStatsWith } from "../fakes/data";

describe("getPlayerSlayerStats", () => {
  describe("default options", () => {
    it("includes score by default", () => {
      const coreStats = aFakeCoreStatsWith({ PersonalScore: 5000 });

      const result = getPlayerSlayerStats(coreStats);

      expect(result.has("Score")).toBe(true);
      expect(result.get("Score")?.value).toBe(5000);
    });

    it("excludes rank by default", () => {
      const coreStats = aFakeCoreStatsWith();

      const result = getPlayerSlayerStats(coreStats);

      expect(result.has("Rank")).toBe(false);
    });
  });

  describe("core stat keys and values", () => {
    it("maps kills from CoreStats", () => {
      const coreStats = aFakeCoreStatsWith({ Kills: 25 });

      const result = getPlayerSlayerStats(coreStats);

      expect(result.get("Kills")?.value).toBe(25);
    });

    it("maps deaths from CoreStats", () => {
      const coreStats = aFakeCoreStatsWith({ Deaths: 10 });

      const result = getPlayerSlayerStats(coreStats);

      expect(result.get("Deaths")?.value).toBe(10);
    });

    it("maps assists from CoreStats", () => {
      const coreStats = aFakeCoreStatsWith({ Assists: 7 });

      const result = getPlayerSlayerStats(coreStats);

      expect(result.get("Assists")?.value).toBe(7);
    });

    it("maps KDA from CoreStats", () => {
      const coreStats = aFakeCoreStatsWith({ KDA: 2.5 });

      const result = getPlayerSlayerStats(coreStats);

      expect(result.get("KDA")?.value).toBe(2.5);
    });

    it("maps headshot kills from CoreStats", () => {
      const coreStats = aFakeCoreStatsWith({ HeadshotKills: 12 });

      const result = getPlayerSlayerStats(coreStats);

      expect(result.get("Headshot kills")?.value).toBe(12);
    });

    it("maps shots hit and shots fired from CoreStats", () => {
      const coreStats = aFakeCoreStatsWith({ ShotsHit: 300, ShotsFired: 600 });

      const result = getPlayerSlayerStats(coreStats);

      expect(result.get("Shots hit")?.value).toBe(300);
      expect(result.get("Shots fired")?.value).toBe(600);
    });

    it("maps accuracy from CoreStats", () => {
      const coreStats = aFakeCoreStatsWith({ Accuracy: 52.1 });

      const result = getPlayerSlayerStats(coreStats);

      expect(result.get("Accuracy")?.value).toBe(52.1);
    });

    it("maps damage dealt and taken from CoreStats", () => {
      const coreStats = aFakeCoreStatsWith({ DamageDealt: 18000, DamageTaken: 15000 });

      const result = getPlayerSlayerStats(coreStats);

      expect(result.get("Damage dealt")?.value).toBe(18000);
      expect(result.get("Damage taken")?.value).toBe(15000);
    });

    it("computes damage ratio from dealt and taken", () => {
      const coreStats = aFakeCoreStatsWith({ DamageDealt: 20000, DamageTaken: 10000 });

      const result = getPlayerSlayerStats(coreStats);

      expect(result.get("Damage ratio")?.value).toBe(2);
    });

    it("computes avg damage per life from dealt and deaths", () => {
      const coreStats = aFakeCoreStatsWith({ DamageDealt: 15000, Deaths: 10 });

      const result = getPlayerSlayerStats(coreStats);

      expect(result.get("Avg damage per life")?.value).toBe(1500);
    });

    it("computes avg life time in seconds from ISO duration", () => {
      const coreStats = aFakeCoreStatsWith({ AverageLifeDuration: "PT1M30S" });

      const result = getPlayerSlayerStats(coreStats);

      expect(result.get("Avg life time")?.value).toBe(90);
    });
  });

  describe("sort directions", () => {
    it("sorts kills descending", () => {
      const result = getPlayerSlayerStats(aFakeCoreStatsWith());
      expect(result.get("Kills")?.sortBy).toBe(StatsValueSortBy.DESC);
    });

    it("sorts deaths ascending", () => {
      const result = getPlayerSlayerStats(aFakeCoreStatsWith());
      expect(result.get("Deaths")?.sortBy).toBe(StatsValueSortBy.ASC);
    });

    it("sorts damage taken ascending", () => {
      const result = getPlayerSlayerStats(aFakeCoreStatsWith());
      expect(result.get("Damage taken")?.sortBy).toBe(StatsValueSortBy.ASC);
    });
  });

  describe("includeRank option", () => {
    it("includes rank when includeRank is true", () => {
      const coreStats = aFakeCoreStatsWith();

      const result = getPlayerSlayerStats(coreStats, { includeRank: true, rank: 3 });

      expect(result.get("Rank")?.value).toBe(3);
    });

    it("sorts rank ascending", () => {
      const result = getPlayerSlayerStats(aFakeCoreStatsWith(), { includeRank: true, rank: 1 });
      expect(result.get("Rank")?.sortBy).toBe(StatsValueSortBy.ASC);
    });
  });

  describe("includeScore option", () => {
    it("excludes score when includeScore is false", () => {
      const coreStats = aFakeCoreStatsWith({ PersonalScore: 5000 });

      const result = getPlayerSlayerStats(coreStats, { includeScore: false });

      expect(result.has("Score")).toBe(false);
    });
  });

  describe("display values", () => {
    it("formats accuracy as percentage", () => {
      const coreStats = aFakeCoreStatsWith({ Accuracy: 52.1 });

      const result = getPlayerSlayerStats(coreStats);

      expect(result.get("Accuracy")?.display).toContain("%");
    });

    it("formats avg life time as readable duration", () => {
      const coreStats = aFakeCoreStatsWith({ AverageLifeDuration: "PT1M30S" });

      const result = getPlayerSlayerStats(coreStats);

      expect(result.get("Avg life time")?.display).toBeTruthy();
    });
  });
});
