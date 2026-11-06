import { MAP_GENERATOR_COUNTS } from "../contracts/individual-tracker/map-generation";
import { Preconditions } from "../base/preconditions";
import { UnreachableError } from "../base/unreachable-error";

export const HCS_LAST_UPDATED = "18 August 2026";

export type HcsMapMode =
  "Slayer" | "Capture the Flag" | "Strongholds" | "Oddball" | "King of the Hill" | "Neutral Bomb";
export type MapMode = string;
export type Format = "random" | "objective" | "slayer";
export type MapGenerationFormat = "HCS" | Format;
export type MapModeFormat = "slayer" | "objective";
export const MAP_COUNTS = MAP_GENERATOR_COUNTS;

export const CURRENT_HCS_MAPS: Record<HcsMapMode, string[]> = {
  Slayer: ["Solitude", "Live Fire", "Recharge", "Streets", "Origin"],
  "Capture the Flag": ["Aquarius", "Empyrean", "Origin"],
  Strongholds: ["Live Fire", "Recharge"],
  Oddball: ["Live Fire", "Lattice", "Recharge", "Streets"],
  "King of the Hill": ["Live Fire", "Lattice", "Recharge", "Streets"],
  "Neutral Bomb": [],
};

export const OBJECTIVE_MODES: HcsMapMode[] = [
  "Capture the Flag",
  "Strongholds",
  "Oddball",
  "King of the Hill",
  "Neutral Bomb",
];

export const HCS_SET_FORMAT: Record<number, Format[]> = {
  1: ["random"],
  3: ["objective", "slayer", "objective"],
  5: ["objective", "slayer", "objective", "objective", "slayer"],
  7: ["objective", "slayer", "objective", "objective", "slayer", "objective", "slayer"],
  9: ["objective", "slayer", "objective", "objective", "slayer", "objective", "slayer", "objective", "slayer"],
  11: [
    "objective",
    "slayer",
    "objective",
    "objective",
    "slayer",
    "objective",
    "slayer",
    "objective",
    "slayer",
    "objective",
    "slayer",
  ],
  13: [
    "objective",
    "slayer",
    "objective",
    "objective",
    "slayer",
    "objective",
    "slayer",
    "objective",
    "slayer",
    "objective",
    "slayer",
    "objective",
    "slayer",
  ],
};

export function getMapModeFormatSequence(
  format: MapGenerationFormat,
  count: number,
  random: () => number = Math.random,
): MapModeFormat[] {
  switch (format) {
    case "HCS": {
      return Preconditions.checkExists(HCS_SET_FORMAT[count]).map((entry) =>
        entry === "random" ? (random() < 1 / 6 ? "slayer" : "objective") : entry,
      );
    }
    case "random": {
      return Array.from({ length: count }, () => (random() < 1 / 6 ? "slayer" : "objective"));
    }
    case "objective": {
      return Array.from({ length: count }, () => "objective");
    }
    case "slayer": {
      return Array.from({ length: count }, () => "slayer");
    }
    default: {
      throw new UnreachableError(format);
    }
  }
}

export const HISTORICAL_HCS_MAPS: Record<HcsMapMode, string[]> = {
  Slayer: ["Aquarius", "Live Fire", "Recharge", "Streets", "Solitude", "Empyrean", "Origin", "Vacancy"],
  "Capture the Flag": ["Aquarius", "Bazaar", "Empyrean", "Forbidden", "Fortress", "Origin"],
  Strongholds: ["Live Fire", "Recharge", "Streets", "Empyrean", "Solitude", "Lattice"],
  Oddball: ["Live Fire", "Recharge", "Streets", "Lattice"],
  "King of the Hill": ["Live Fire", "Recharge", "Streets", "Solitude", "Lattice", "Vacancy"],
  "Neutral Bomb": ["Aquarius", "Fortress"],
};

export const ALL_MODES: HcsMapMode[] = [
  "Slayer",
  "Capture the Flag",
  "Strongholds",
  "Oddball",
  "King of the Hill",
  "Neutral Bomb",
];
