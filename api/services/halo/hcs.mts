// HCS map/mode pool

export const HCS_LAST_UPDATED = "26 August 2025";

export type MapMode = "Slayer" | "Capture the Flag" | "Strongholds" | "Oddball" | "King of the Hill" | "Neutral Bomb";
export type Format = "random" | "objective" | "slayer";

export const CURRENT_HCS_MAPS: Record<MapMode, string[]> = {
  Slayer: ["Aquarius", "Live Fire", "Origin", "Recharge", "Solitude", "Streets"],
  "Capture the Flag": ["Aquarius", "Forbidden", "Fortress", "Origin"],
  Strongholds: ["Live Fire", "Lattice", "Recharge"],
  Oddball: ["Live Fire", "Recharge", "Lattice"],
  "King of the Hill": ["Live Fire", "Recharge", "Lattice"],
  "Neutral Bomb": ["Aquarius"],
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
  Slayer: ["Aquarius", "Live Fire", "Recharge", "Streets", "Solitude", "Empyrean", "Origin"],
  "Capture the Flag": ["Aquarius", "Bazaar", "Empyrean", "Forbidden", "Fortress", "Origin"],
  Strongholds: ["Live Fire", "Recharge", "Streets", "Empyrean", "Solitude", "Lattice"],
  Oddball: ["Live Fire", "Recharge", "Streets", "Lattice"],
  "King of the Hill": ["Live Fire", "Recharge", "Streets", "Solitude", "Lattice"],
  "Neutral Bomb": ["Aquarius", "Fortress"],
};

export const LUCID_EVO_MAPS: Record<MapMode, string[]> = {
  Slayer: ["Aquarius", "Live Fire", "Recharge", "Solitude"],
  "Capture the Flag": ["Aquarius", "Bazaar", "Catalyst", "Forbidden"],
  Strongholds: ["Recharge", "Solitude", "Streets"],
  Oddball: ["Live Fire", "Recharge", "Streets"],
  "King of the Hill": ["Live Fire", "Recharge", "Solitude", "Streets"],
  "Neutral Bomb": [],
};

export const ALL_MODES: MapMode[] = [
  "Slayer",
  "Capture the Flag",
  "Strongholds",
  "Oddball",
  "King of the Hill",
  "Neutral Bomb",
];
