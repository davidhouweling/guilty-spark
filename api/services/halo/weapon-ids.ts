const WEAPON_ID_MAP: ReadonlyMap<bigint, string> = new Map([
  [0x6acdc44d42c9679fn, "Bandit Evo"],
  [0x6683257c42c9679fn, "Bandit Evo"],
  [0xf2b458ec42c9679fn, "Bandit Evo"],
  [0xd59b889a42c9679fn, "Bandit Evo"],
  [0x0131ea1042c9679fn, "Bandit Evo"],
  [0xb017106242c9679fn, "Bandit Evo"],
  [0x91eb16de42c9679fn, "Bandit Evo"],
  [0xedff0e9642c9679fn, "Bandit Evo"],
  [0x2b1824d542c9679fn, "BR75"],
  [0x230447b142c9679fn, "Cindershot"],
  [0xb619d84a42c9679fn, "CQS48 Bulldog"],
  [0x84bd29ed42c9679fn, "Disruptor"],
  [0x9d6aaed242c9679fn, "Fuel Rod SPNKr"],
  [0x841ac5e542c9679fn, "Gravity Hammer"],
  [0x2ac9c2ff42c9679fn, "Heatwave"],
  [0x71ab0a2c42c9679fn, "M41 SPNKr"],
  [0x2fb21c8742c9679fn, "M392 Bandit"],
  [0x48c19d2d42c9679fn, "MA40 AR"],
  [0xf5c335dfe7232c0fn, "MA5K Avenger"],
  [0x80977ba542c9679fn, "Mangler"],
  [0x767db96d42c9679fn, "MLRS-2 Hydra"],
  [0xf408190f42c9679fn, "Mk51 Sidekick"],
  [0x91833a5a42c9679fn, "Mk51 Sidekick"],
  [0x831d801242c9679fn, "Mk51 Sidekick"],
  [0xd791556542c9679fn, "Mutilator"],
  [0xb533957e42c9679fn, "Needler"],
  [0xc354294642c9679fn, "Plasma Pistol"],
  [0x30484ea642c9679fn, "Pulse Carbine"],
  [0xc30d87c742c9679fn, "Ravager"],
  [0x0a1992bc42c9679fn, "S7 Sniper"],
  [0x94c3a67a42c9679fn, "S7 Sniper"],
  [0x880fe0bc42c9679fn, "Sandwich"],
  [0xa0955e9e42c9679fn, "Sentinel Beam"],
  [0xe86bd55e42c9679fn, "Sentinel Beam"],
  [0x9387a8b942c9679fn, "Shock Rifle"],
  [0x1a22fee642c9679fn, "Shock Rifle (Ranked)"],
  [0x0d20c46942c9679fn, "Skewer"],
  [0xdaf193c742c9679fn, "Stalker Rifle"],
  [0x3e07021742c9679fn, "Vestige Carbine"],
  [0xfd98554c42c9679fn, "VK78 Commando"],
  // Energy Sword family
  [0x4ff3937e42c9679fn, "Energy Sword"],
  [0x4ff3937e8978aa7an, "Duelist Energy Sword"],
  [0x4ff3937e1ec48c7an, "Elite Bloodblade"],
  [0x0c55765f7a9376a0n, "Infected Energy Sword"],
  // Gravity Hammer family
  [0x841ac5e5a730e49fn, "Diminisher of Hope"],
  [0x841ac5e5d8d07ca1n, "Rushdown Hammer"],
  // Grenades
  [0xb6dbead842c9679fn, "Frag Grenade"],
  [0xc1e1bab042c9679fn, "Plasma Grenade"],
  [0x3ad55da442c9679fn, "Dynamo Grenade"],
]);

export const KNOWN_WEAPON_IDS: ReadonlySet<bigint> = new Set(WEAPON_ID_MAP.keys());

// Most weapons share this 4-byte suffix in their film ID (bytes 4–7 big-endian).
export const COMMON_WEAPON_SUFFIX = 0x42c9679fn;

export function lookupWeaponName(weaponId: bigint): string | null {
  return WEAPON_ID_MAP.get(weaponId) ?? null;
}

export function weaponIdToHex(weaponId: bigint): string {
  return weaponId.toString(16).toUpperCase().padStart(16, "0");
}

export function hasCommonWeaponSuffix(weaponId: bigint): boolean {
  return (weaponId & 0xffff_ffffn) === COMMON_WEAPON_SUFFIX;
}
