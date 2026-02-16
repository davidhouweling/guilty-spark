// HCS map/mode pool

export const HCS_LAST_UPDATED = "16 February 2026";

export type MapMode = "Slayer" | "Capture the Flag" | "Strongholds" | "Oddball" | "King of the Hill" | "Neutral Bomb";
export type Format = "random" | "objective" | "slayer";

export const CURRENT_HCS_MAPS: Record<MapMode, string[]> = {
  Slayer: ["Vacancy", "Live Fire", "Recharge", "Solitude", "Streets", "Origin"],
  "Capture the Flag": ["Aquarius", "Empyrean", "Origin"],
  Strongholds: ["Live Fire", "Recharge"],
  Oddball: ["Live Fire", "Recharge", "Lattice"],
  "King of the Hill": ["Live Fire", "Vacancy", "Lattice"],
  "Neutral Bomb": [],
};

export const OBJECTIVE_MODES: Omit<MapMode, "Slayer">[] = [
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
};

export const HISTORICAL_HCS_MAPS: Record<MapMode, string[]> = {
  Slayer: ["Aquarius", "Live Fire", "Recharge", "Streets", "Solitude", "Empyrean", "Origin", "Vacancy"],
  "Capture the Flag": ["Aquarius", "Bazaar", "Empyrean", "Forbidden", "Fortress", "Origin"],
  Strongholds: ["Live Fire", "Recharge", "Streets", "Empyrean", "Solitude", "Lattice"],
  Oddball: ["Live Fire", "Recharge", "Streets", "Lattice"],
  "King of the Hill": ["Live Fire", "Recharge", "Streets", "Solitude", "Lattice", "Vacancy"],
  "Neutral Bomb": ["Aquarius", "Fortress"],
};

export const ALL_MODES: MapMode[] = [
  "Slayer",
  "Capture the Flag",
  "Strongholds",
  "Oddball",
  "King of the Hill",
  "Neutral Bomb",
];
