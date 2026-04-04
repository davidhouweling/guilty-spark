import type { MatchSkill } from "halo-infinite-api";

/**
 * Represents tier counterfactuals for a single stat dimension (kills or deaths)
 */
interface SingleDimensionTierCounterfactual {
  Bronze: number;
  Silver: number;
  Gold: number;
  Platinum: number;
  Diamond: number;
  Onyx: number;
}

/**
 * Computes skill value (0-1500 scale) from a raw performance value and tier counterfactuals
 * @param value - The player's actual performance value (kills or deaths)
 * @param counterFactuals - Tier thresholds for this stat
 * @param higherIsBetter - True for kills (higher is better), false for deaths (lower is better)
 * @returns Skill value on 0-1500 scale, or undefined if counterfactuals are empty
 */
export function computeSkill(
  value: number,
  counterFactuals: SingleDimensionTierCounterfactual,
  higherIsBetter: boolean,
): number | undefined {
  if (Object.keys(counterFactuals).length === 0) {
    return undefined;
  }

  let divisionValues: {
    lower: number;
    upper: number;
  };
  let divisionMMRs: {
    lower: number;
    upper: number;
  };

  if ((higherIsBetter && value < counterFactuals.Silver) || (!higherIsBetter && value >= counterFactuals.Silver)) {
    divisionValues = {
      lower: counterFactuals.Bronze,
      upper: counterFactuals.Silver,
    };
    divisionMMRs = {
      lower: 0,
      upper: 300,
    };
  } else if ((higherIsBetter && value < counterFactuals.Gold) || (!higherIsBetter && value >= counterFactuals.Gold)) {
    divisionValues = {
      lower: counterFactuals.Silver,
      upper: counterFactuals.Gold,
    };
    divisionMMRs = {
      lower: 300,
      upper: 600,
    };
  } else if (
    (higherIsBetter && value < counterFactuals.Platinum) ||
    (!higherIsBetter && value >= counterFactuals.Platinum)
  ) {
    divisionValues = {
      lower: counterFactuals.Gold,
      upper: counterFactuals.Platinum,
    };
    divisionMMRs = {
      lower: 600,
      upper: 900,
    };
  } else if (
    (higherIsBetter && value < counterFactuals.Diamond) ||
    (!higherIsBetter && value >= counterFactuals.Diamond)
  ) {
    divisionValues = {
      lower: counterFactuals.Platinum,
      upper: counterFactuals.Diamond,
    };
    divisionMMRs = {
      lower: 900,
      upper: 1200,
    };
  } else {
    divisionValues = {
      lower: counterFactuals.Diamond,
      upper: counterFactuals.Onyx,
    };
    divisionMMRs = {
      lower: 1200,
      upper: 1500,
    };
  }

  return (
    ((value - divisionValues.lower) / (divisionValues.upper - divisionValues.lower)) *
      (divisionMMRs.upper - divisionMMRs.lower) +
    divisionMMRs.lower
  );
}

/**
 * Type guard to check if counterfactuals are valid for a given stat
 */
export function isValidCounterfactual(
  counterFactuals: MatchSkill<1 | 0>["Counterfactuals"],
  stat: "Kills" | "Deaths",
): counterFactuals is MatchSkill["Counterfactuals"] {
  if (!counterFactuals || Object.values(counterFactuals.TierCounterfactuals).some((v) => v[stat] === "NaN")) {
    return false;
  }

  if (typeof counterFactuals.SelfCounterfactuals[stat] === "number" && counterFactuals.SelfCounterfactuals[stat] < 0) {
    return false;
  }
  return true;
}

/**
 * Type guard to check if stat performances are valid
 */
export function isValidStatPerformance(
  statPerformances: MatchSkill<1 | 0>["StatPerformances"],
): statPerformances is Exclude<typeof statPerformances, Record<string, never>> {
  return "Kills" in statPerformances && "Deaths" in statPerformances;
}

/**
 * Calculates skill rank (0-1500 scale) for a single stat (kills or deaths)
 * @param skill - The player's skill data from a match
 * @param stat - Which stat to calculate ("Kills" or "Deaths")
 * @param expectedOrCount - Use "Expected" for ESRA calculation, "Count" for actual performance
 * @returns Skill rank value or undefined if data is invalid
 */
export function skillRank(
  skill: Pick<MatchSkill<1 | 0>, "StatPerformances" | "Counterfactuals"> | undefined,
  stat: "Kills" | "Deaths",
  expectedOrCount: "Expected" | "Count",
): number | undefined {
  if (skill == null) {
    return undefined;
  }

  if (!isValidCounterfactual(skill.Counterfactuals, stat)) {
    return undefined;
  }

  const tierCounterfactuals = skill.Counterfactuals.TierCounterfactuals;

  let value: number;
  if (
    isValidStatPerformance(skill.StatPerformances) &&
    typeof skill.StatPerformances[stat][expectedOrCount] === "number"
  ) {
    value = skill.StatPerformances[stat][expectedOrCount];
  } else if (typeof skill.Counterfactuals.SelfCounterfactuals[stat] === "number") {
    value = skill.Counterfactuals.SelfCounterfactuals[stat];
  } else {
    return undefined;
  }

  const singleDimensionCounterfactuals: SingleDimensionTierCounterfactual = {
    Bronze: typeof tierCounterfactuals.Bronze[stat] === "number" ? tierCounterfactuals.Bronze[stat] : 0,
    Silver: typeof tierCounterfactuals.Silver[stat] === "number" ? tierCounterfactuals.Silver[stat] : 0,
    Gold: typeof tierCounterfactuals.Gold[stat] === "number" ? tierCounterfactuals.Gold[stat] : 0,
    Platinum: typeof tierCounterfactuals.Platinum[stat] === "number" ? tierCounterfactuals.Platinum[stat] : 0,
    Diamond: typeof tierCounterfactuals.Diamond[stat] === "number" ? tierCounterfactuals.Diamond[stat] : 0,
    Onyx: typeof tierCounterfactuals.Onyx[stat] === "number" ? tierCounterfactuals.Onyx[stat] : 0,
  };

  return computeSkill(value, singleDimensionCounterfactuals, stat === "Kills");
}

/**
 * Calculates combined skill rank by averaging kills and deaths skill ranks
 * This is the core ESRA calculation for a single match
 * @param skill - The player's skill data from a match
 * @param expectedOrCount - Use "Expected" for ESRA calculation
 * @returns Average skill rank or undefined if data is invalid
 */
export function skillRankCombined(
  skill: MatchSkill<1 | 0> | undefined,
  expectedOrCount: "Expected",
): number | undefined {
  const values: number[] = [];

  const killSkillRank = skillRank(skill, "Kills", expectedOrCount);
  if (killSkillRank != null && !Number.isNaN(killSkillRank)) {
    values.push(killSkillRank);
  }

  const deathSkillRank = skillRank(skill, "Deaths", expectedOrCount);
  if (deathSkillRank != null && !Number.isNaN(deathSkillRank)) {
    values.push(deathSkillRank);
  }

  if (values.length === 0) {
    return undefined;
  }

  return values.reduce((sum, val) => sum + val, 0) / values.length;
}
