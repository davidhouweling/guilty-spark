import { GameVariantCategory } from "halo-infinite-api";

export const RESPAWN_DURATION_MS: Partial<Record<number, number>> = {
  [GameVariantCategory.MultiplayerSlayer]: 8000,
  [GameVariantCategory.MultiplayerFiesta]: 8000,
  // HCS Strongholds, Oddball and King of the Hill respawns are not published; they match the
  // ranked arena slayer duration until theatre-verified otherwise
  [GameVariantCategory.MultiplayerStrongholds]: 8000,
  [GameVariantCategory.MultiplayerOddball]: 8000,
  [GameVariantCategory.MultiplayerKingOfTheHill]: 8000,
  // measured on every respawn of the ranked CTF reference match (film biped lives, PR #1024)
  [GameVariantCategory.MultiplayerCtf]: 10000,
  // Attrition uses a lives-pool mechanic with teammate revival; respawn duration TBD
};
