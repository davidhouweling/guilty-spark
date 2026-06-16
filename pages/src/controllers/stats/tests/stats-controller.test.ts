import { describe, expect, it } from "vitest";
import { StatsController } from "../stats-controller";
import { aFakeMatchStatsWith, aFakeMedalMetadata } from "../fakes/data";
import { aFakeMatchAnalyticsWith } from "../kill-matrix/fakes/match-analytics.fake";

const aPlayerMap = (): Map<string, string> =>
  new Map([
    ["1111111111", "Alpha"],
    ["2222222222", "Bravo"],
    ["3333333333", "Charlie"],
    ["4444444444", "Delta"],
  ]);

describe("StatsController", () => {
  describe("getMatchStats", () => {
    it("throws before loadMatch is called", () => {
      const controller = new StatsController();
      expect(() => controller.getMatchStats()).toThrow();
    });

    it("returns match stats data after loadMatch", () => {
      const controller = new StatsController();
      controller.loadMatch(aFakeMatchStatsWith(), aPlayerMap(), aFakeMedalMetadata());
      const result = controller.getMatchStats();
      expect(result.length).toBeGreaterThan(0);
    });

    it("organises stats by team", () => {
      const controller = new StatsController();
      controller.loadMatch(aFakeMatchStatsWith(), aPlayerMap(), aFakeMedalMetadata());
      const result = controller.getMatchStats();
      const teamIds = result.map((d) => d.teamId);
      expect(teamIds).toContain(0);
      expect(teamIds).toContain(1);
    });
  });

  describe("getSeriesStats", () => {
    it("throws before loadSeries is called", () => {
      const controller = new StatsController();
      expect(() => controller.getSeriesStats()).toThrow();
    });

    it("returns both teamData and playerData after loadSeries", () => {
      const controller = new StatsController();
      const match = aFakeMatchStatsWith();
      controller.loadSeries([match], aPlayerMap(), aFakeMedalMetadata());
      const { teamData, playerData } = controller.getSeriesStats();
      expect(teamData.length).toBeGreaterThan(0);
      expect(playerData.length).toBeGreaterThan(0);
    });
  });

  describe("getKillMatrix", () => {
    it("throws before loadAnalytics is called", () => {
      const controller = new StatsController();
      expect(() => controller.getKillMatrix()).toThrow();
    });

    it("returns kill matrix rows after loadAnalytics", () => {
      const controller = new StatsController();
      const playerMap = new Map([
        ["111", "Alpha"],
        ["222", "Bravo"],
        ["333", "Charlie"],
        ["444", "Delta"],
      ]);
      controller.loadAnalytics(aFakeMatchAnalyticsWith(), playerMap);
      const rows = controller.getKillMatrix();
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe("getPlayers", () => {
    it("throws before loadMatch or loadSeries is called", () => {
      const controller = new StatsController();
      expect(() => controller.getPlayers()).toThrow();
    });

    it("returns players with team context after loadMatch", () => {
      const controller = new StatsController();
      controller.loadMatch(aFakeMatchStatsWith(), aPlayerMap(), aFakeMedalMetadata());
      const players = controller.getPlayers();
      expect(players.length).toBeGreaterThan(0);
      expect(players.every((p) => p.teamId != null)).toBe(true);
    });

    it("maps gamertags to xuids from the player map", () => {
      const controller = new StatsController();
      controller.loadMatch(aFakeMatchStatsWith(), aPlayerMap(), aFakeMedalMetadata());
      const players = controller.getPlayers();
      const alphaPlayer = players.find((p) => p.gamertag === "Alpha");
      expect(alphaPlayer?.xuid).toBe("1111111111");
    });

    it("preserves team assignment for each player", () => {
      const controller = new StatsController();
      controller.loadMatch(aFakeMatchStatsWith(), aPlayerMap(), aFakeMedalMetadata());
      const players = controller.getPlayers();
      const alpha = players.find((p) => p.gamertag === "Alpha");
      const charlie = players.find((p) => p.gamertag === "Charlie");
      expect(alpha?.teamId).toBe(0);
      expect(charlie?.teamId).toBe(1);
    });

    it("returns players with team context after loadSeries", () => {
      const controller = new StatsController();
      controller.loadSeries([aFakeMatchStatsWith()], aPlayerMap(), aFakeMedalMetadata());
      const players = controller.getPlayers();
      expect(players.length).toBeGreaterThan(0);
      expect(players.every((p) => p.teamId != null)).toBe(true);
    });
  });

  describe("kill matrix team enrichment", () => {
    it("includes team context in kill matrix rows when loadMatch precedes loadAnalytics", () => {
      const controller = new StatsController();
      const playerMap = aPlayerMap();
      controller.loadMatch(aFakeMatchStatsWith(), playerMap, aFakeMedalMetadata());

      const analyticsPlayerMap = new Map([
        ["1111111111", "Alpha"],
        ["2222222222", "Bravo"],
      ]);
      const analytics = aFakeMatchAnalyticsWith({
        killMatrix: {
          "1111111111:2222222222": { count: 2, headshotKills: 1, perfects: 0, weapons: [] },
        },
      });
      controller.loadAnalytics(analytics, analyticsPlayerMap);

      const rows = controller.getKillMatrix();
      expect(rows[0].killer.teamId).toBe(0);
      expect(rows[0].victim.teamId).toBe(0);
    });
  });

  describe("independent load methods", () => {
    it("loadMatch and loadAnalytics can coexist on the same instance", () => {
      const controller = new StatsController();
      controller.loadMatch(aFakeMatchStatsWith(), aPlayerMap(), aFakeMedalMetadata());
      controller.loadAnalytics(
        aFakeMatchAnalyticsWith(),
        new Map([
          ["111", "Alpha"],
          ["222", "Bravo"],
        ]),
      );
      expect(() => controller.getMatchStats()).not.toThrow();
      expect(() => controller.getKillMatrix()).not.toThrow();
    });

    it("loadSeries does not satisfy getMatchStats", () => {
      const controller = new StatsController();
      controller.loadSeries([aFakeMatchStatsWith()], aPlayerMap(), aFakeMedalMetadata());
      expect(() => controller.getMatchStats()).toThrow();
    });

    it("loadMatch does not satisfy getSeriesStats", () => {
      const controller = new StatsController();
      controller.loadMatch(aFakeMatchStatsWith(), aPlayerMap(), aFakeMedalMetadata());
      expect(() => controller.getSeriesStats()).toThrow();
    });
  });
});
