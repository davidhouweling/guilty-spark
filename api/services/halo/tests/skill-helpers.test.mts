import { describe, it, expect } from "vitest";
import {
  computeSkill,
  isValidCounterfactual,
  isValidStatPerformance,
  skillRank,
  skillRankCombined,
} from "../skill-helpers.mjs";
import { matchSkillData } from "../fakes/data.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";

describe("skill-helpers", () => {
  describe("computeSkill()", () => {
    it("returns undefined if counterfactuals are empty", () => {
      const result = computeSkill(10, {} as never, true);

      expect(result).toBeUndefined();
    });

    it("computes Bronze tier skill (0-300) for kills", () => {
      const counterFactuals = {
        Bronze: -0.78,
        Silver: 0.91,
        Gold: 6.16,
        Platinum: 12.37,
        Diamond: 18.57,
        Onyx: 25.64,
      };

      // Value between Bronze and Silver thresholds
      const result = computeSkill(0, counterFactuals, true);

      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(300);
    });

    it("computes Silver tier skill (300-600) for kills", () => {
      const counterFactuals = {
        Bronze: -0.78,
        Silver: 0.91,
        Gold: 6.16,
        Platinum: 12.37,
        Diamond: 18.57,
        Onyx: 25.64,
      };

      // Value between Silver and Gold thresholds
      const result = computeSkill(3, counterFactuals, true);

      expect(result).toBeGreaterThanOrEqual(300);
      expect(result).toBeLessThan(600);
    });

    it("computes Gold tier skill (600-900) for kills", () => {
      const counterFactuals = {
        Bronze: -0.78,
        Silver: 0.91,
        Gold: 6.16,
        Platinum: 12.37,
        Diamond: 18.57,
        Onyx: 25.64,
      };

      // Value between Gold and Platinum thresholds
      const result = computeSkill(9, counterFactuals, true);

      expect(result).toBeGreaterThanOrEqual(600);
      expect(result).toBeLessThan(900);
    });

    it("computes Platinum tier skill (900-1200) for kills", () => {
      const counterFactuals = {
        Bronze: -0.78,
        Silver: 0.91,
        Gold: 6.16,
        Platinum: 12.37,
        Diamond: 18.57,
        Onyx: 25.64,
      };

      // Value between Platinum and Diamond thresholds
      const result = computeSkill(15, counterFactuals, true);

      expect(result).toBeGreaterThanOrEqual(900);
      expect(result).toBeLessThan(1200);
    });

    it("computes Diamond tier skill (1200-1500) for kills", () => {
      const counterFactuals = {
        Bronze: -0.78,
        Silver: 0.91,
        Gold: 6.16,
        Platinum: 12.37,
        Diamond: 18.57,
        Onyx: 25.64,
      };

      // Value between Diamond and Onyx thresholds
      const result = computeSkill(20, counterFactuals, true);

      expect(result).toBeGreaterThanOrEqual(1200);
      expect(result).toBeLessThan(1500);
    });

    it("computes Onyx tier skill (1200+) for very high kills", () => {
      const counterFactuals = {
        Bronze: -0.78,
        Silver: 0.91,
        Gold: 6.16,
        Platinum: 12.37,
        Diamond: 18.57,
        Onyx: 25.64,
      };

      // Value above Onyx threshold - can exceed 1500
      const result = computeSkill(30, counterFactuals, true);

      expect(result).toBeGreaterThanOrEqual(1200);
      // Note: Values above Onyx threshold can exceed 1500
      expect(result).toBeGreaterThan(1500);
    });

    it("computes skill for deaths where lower is better", () => {
      const counterFactuals = {
        Bronze: 23.74,
        Silver: 22.03,
        Gold: 20.32,
        Platinum: 18.54,
        Diamond: 16.59,
        Onyx: 14.31,
      };

      // Lower deaths (16) should result in higher skill (Diamond range)
      const result = computeSkill(16, counterFactuals, false);

      expect(result).toBeGreaterThanOrEqual(1200);
      expect(result).toBeLessThan(1500);
    });

    it("handles edge case at exact tier boundary", () => {
      const counterFactuals = {
        Bronze: 0,
        Silver: 10,
        Gold: 20,
        Platinum: 30,
        Diamond: 40,
        Onyx: 50,
      };

      // Exact Silver threshold
      const result = computeSkill(10, counterFactuals, true);

      expect(result).toBe(300);
    });
  });

  describe("isValidCounterfactual()", () => {
    it("returns false if counterfactuals is null", () => {
      const result = isValidCounterfactual(null as never, "Kills");

      expect(result).toBe(false);
    });

    it("returns false if any tier counterfactual is NaN", () => {
      const counterFactuals = {
        SelfCounterfactuals: { Kills: 10, Deaths: 15 },
        TierCounterfactuals: {
          Bronze: { Kills: 1, Deaths: 20 },
          Silver: { Kills: "NaN", Deaths: 18 },
          Gold: { Kills: 5, Deaths: 16 },
          Platinum: { Kills: 10, Deaths: 14 },
          Diamond: { Kills: 15, Deaths: 12 },
          Onyx: { Kills: 20, Deaths: 10 },
        },
      };

      const result = isValidCounterfactual(counterFactuals as never, "Kills");

      expect(result).toBe(false);
    });

    it("returns false if self counterfactual is negative", () => {
      const counterFactuals = {
        SelfCounterfactuals: { Kills: -5, Deaths: 15 },
        TierCounterfactuals: {
          Bronze: { Kills: 1, Deaths: 20 },
          Silver: { Kills: 3, Deaths: 18 },
          Gold: { Kills: 5, Deaths: 16 },
          Platinum: { Kills: 10, Deaths: 14 },
          Diamond: { Kills: 15, Deaths: 12 },
          Onyx: { Kills: 20, Deaths: 10 },
        },
      };

      const result = isValidCounterfactual(counterFactuals as never, "Kills");

      expect(result).toBe(false);
    });

    it("returns true for valid counterfactuals", () => {
      const counterFactuals = {
        SelfCounterfactuals: { Kills: 18.69, Deaths: 16.55 },
        TierCounterfactuals: {
          Bronze: { Kills: -0.78, Deaths: 23.74 },
          Silver: { Kills: 0.91, Deaths: 22.03 },
          Gold: { Kills: 6.16, Deaths: 20.32 },
          Platinum: { Kills: 12.37, Deaths: 18.54 },
          Diamond: { Kills: 18.57, Deaths: 16.59 },
          Onyx: { Kills: 25.64, Deaths: 14.31 },
        },
      };

      const result = isValidCounterfactual(counterFactuals as never, "Kills");

      expect(result).toBe(true);
    });
  });

  describe("isValidStatPerformance()", () => {
    it("returns false for empty object", () => {
      const result = isValidStatPerformance({});

      expect(result).toBe(false);
    });

    it("returns false if Kills is missing", () => {
      const statPerformances = {
        Deaths: { Count: 15, Expected: 16.5, StdDev: 5.0 },
      };

      const result = isValidStatPerformance(statPerformances as never);

      expect(result).toBe(false);
    });

    it("returns false if Deaths is missing", () => {
      const statPerformances = {
        Kills: { Count: 18, Expected: 18.7, StdDev: 5.2 },
      };

      const result = isValidStatPerformance(statPerformances as never);

      expect(result).toBe(false);
    });

    it("returns true when both Kills and Deaths are present", () => {
      const statPerformances = {
        Kills: { Count: 18, Expected: 18.7, StdDev: 5.2 },
        Deaths: { Count: 15, Expected: 16.5, StdDev: 5.0 },
      };

      const result = isValidStatPerformance(statPerformances);

      expect(result).toBe(true);
    });
  });

  describe("skillRank()", () => {
    it("returns undefined if skill is undefined", () => {
      const result = skillRank(undefined, "Kills", "Expected");

      expect(result).toBeUndefined();
    });

    it("returns undefined if counterfactuals are invalid", () => {
      const skill = {
        StatPerformances: {},
        Counterfactuals: {
          SelfCounterfactuals: { Kills: -5, Deaths: 15 },
          TierCounterfactuals: {
            Bronze: { Kills: 1, Deaths: 20 },
            Silver: { Kills: 3, Deaths: 18 },
            Gold: { Kills: 5, Deaths: 16 },
            Platinum: { Kills: 10, Deaths: 14 },
            Diamond: { Kills: 15, Deaths: 12 },
            Onyx: { Kills: 20, Deaths: 10 },
          },
        },
      };

      const result = skillRank(skill as never, "Kills", "Expected");

      expect(result).toBeUndefined();
    });

    it("calculates skill rank from StatPerformances.Expected when available", () => {
      const player = Preconditions.checkExists(matchSkillData.find((p) => p.Id === "xuid(2535451623062020)"));
      const skill = player.Result;

      const result = skillRank(skill, "Kills", "Expected");

      expect(result).toBeDefined();
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(1500);
    });

    it("falls back to SelfCounterfactuals when StatPerformances are not available", () => {
      const skill = {
        StatPerformances: {},
        Counterfactuals: {
          SelfCounterfactuals: { Kills: 18.69, Deaths: 16.55 },
          TierCounterfactuals: {
            Bronze: { Kills: -0.78, Deaths: 23.74 },
            Silver: { Kills: 0.91, Deaths: 22.03 },
            Gold: { Kills: 6.16, Deaths: 20.32 },
            Platinum: { Kills: 12.37, Deaths: 18.54 },
            Diamond: { Kills: 18.57, Deaths: 16.59 },
            Onyx: { Kills: 25.64, Deaths: 14.31 },
          },
        },
      };

      const result = skillRank(skill as never, "Kills", "Expected");

      expect(result).toBeDefined();
      expect(result).toBeGreaterThan(1100);
      expect(result).toBeLessThan(1300);
    });

    it("calculates skill rank for deaths", () => {
      const player = Preconditions.checkExists(matchSkillData.find((p) => p.Id === "xuid(2535451623062020)"));
      const skill = player.Result;

      const result = skillRank(skill, "Deaths", "Expected");

      expect(result).toBeDefined();
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(1500);
    });

    it("returns undefined if stat value is not a number", () => {
      const skill = {
        StatPerformances: {
          Kills: { Count: 18, Expected: "not-a-number", StdDev: 5.2 },
          Deaths: { Count: 15, Expected: 16.5, StdDev: 5.0 },
        },
        Counterfactuals: {
          SelfCounterfactuals: { Kills: "not-a-number", Deaths: 16.55 },
          TierCounterfactuals: {
            Bronze: { Kills: -0.78, Deaths: 23.74 },
            Silver: { Kills: 0.91, Deaths: 22.03 },
            Gold: { Kills: 6.16, Deaths: 20.32 },
            Platinum: { Kills: 12.37, Deaths: 18.54 },
            Diamond: { Kills: 18.57, Deaths: 16.59 },
            Onyx: { Kills: 25.64, Deaths: 14.31 },
          },
        },
      };

      const result = skillRank(skill as never, "Kills", "Expected");

      expect(result).toBeUndefined();
    });
  });

  describe("skillRankCombined()", () => {
    it("returns undefined if skill is undefined", () => {
      const result = skillRankCombined(undefined, "Expected");

      expect(result).toBeUndefined();
    });

    it("averages kills and deaths skill ranks", () => {
      const player = Preconditions.checkExists(matchSkillData.find((p) => p.Id === "xuid(2535451623062020)"));
      const skill = player.Result;

      const killsSkill = skillRank(skill, "Kills", "Expected");
      const deathsSkill = skillRank(skill, "Deaths", "Expected");
      const combined = skillRankCombined(skill, "Expected");

      expect(combined).toBeDefined();
      expect(killsSkill).toBeDefined();
      expect(deathsSkill).toBeDefined();

      const expectedAverage = ((killsSkill ?? 0) + (deathsSkill ?? 0)) / 2;
      expect(combined).toBeCloseTo(expectedAverage, 5);
    });

    it("returns skill rank even if only one stat is valid", () => {
      const skill = {
        StatPerformances: {
          Kills: { Count: 18, Expected: 18.69, StdDev: 5.2 },
          Deaths: { Count: 15, Expected: NaN, StdDev: 5.0 },
        },
        Counterfactuals: {
          SelfCounterfactuals: { Kills: 18.69, Deaths: 16.55 },
          TierCounterfactuals: {
            Bronze: { Kills: -0.78, Deaths: 23.74 },
            Silver: { Kills: 0.91, Deaths: 22.03 },
            Gold: { Kills: 6.16, Deaths: 20.32 },
            Platinum: { Kills: 12.37, Deaths: 18.54 },
            Diamond: { Kills: 18.57, Deaths: 16.59 },
            Onyx: { Kills: 25.64, Deaths: 14.31 },
          },
        },
      };

      const result = skillRankCombined(skill as never, "Expected");

      expect(result).toBeDefined();
      expect(result).toBeGreaterThan(0);
    });

    it("returns undefined if both kills and deaths are invalid", () => {
      const skill = {
        StatPerformances: {},
        Counterfactuals: {
          SelfCounterfactuals: { Kills: -5, Deaths: -10 },
          TierCounterfactuals: {
            Bronze: { Kills: -0.78, Deaths: 23.74 },
            Silver: { Kills: 0.91, Deaths: 22.03 },
            Gold: { Kills: 6.16, Deaths: 20.32 },
            Platinum: { Kills: 12.37, Deaths: 18.54 },
            Diamond: { Kills: 18.57, Deaths: 16.59 },
            Onyx: { Kills: 25.64, Deaths: 14.31 },
          },
        },
      };

      const result = skillRankCombined(skill as never, "Expected");

      expect(result).toBeUndefined();
    });

    it("calculates ESRA for all players in match skill data", () => {
      const results = matchSkillData
        .filter((p) => p.ResultCode === 0)
        .map((player) => ({
          xuid: player.Id,
          esra: skillRankCombined(player.Result, "Expected"),
        }));

      // All players should have valid ESRA
      for (const result of results) {
        expect(result.esra).toBeDefined();
        expect(result.esra).toBeGreaterThan(0);
        expect(result.esra).toBeLessThanOrEqual(1500);
      }

      expect(results.length).toBe(8);
    });

    it("handles players in placement matches (measurement matches remaining)", () => {
      // Player with MeasurementMatchesRemaining in the data
      const player = matchSkillData.find((p) => p.Result.RankRecap.PreMatchCsr.MeasurementMatchesRemaining > 0);

      if (player) {
        const result = skillRankCombined(player.Result, "Expected");

        expect(result).toBeDefined();
        expect(result).toBeGreaterThan(0);
        expect(result).toBeLessThanOrEqual(1500);
      }
    });

    it("calculates different ESRA values for players with different performance", () => {
      const player1 = Preconditions.checkExists(matchSkillData.find((p) => p.Id === "xuid(2535461840898551)"));
      const player2 = Preconditions.checkExists(matchSkillData.find((p) => p.Id === "xuid(2535418351231694)"));

      const esra1 = skillRankCombined(player1.Result, "Expected");
      const esra2 = skillRankCombined(player2.Result, "Expected");

      expect(esra1).toBeDefined();
      expect(esra2).toBeDefined();

      // Player 1 had 34 kills/12 deaths, player 2 had 5 kills/26 deaths
      // Player 1 should have significantly higher ESRA
      expect(esra1).toBeGreaterThan(esra2 ?? 0);
    });
  });
});
