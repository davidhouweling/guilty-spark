import { GameVariantCategory } from "halo-infinite-api";

export const RESPAWN_DURATION_MS: Partial<Record<number, number>> = {
  [GameVariantCategory.MultiplayerSlayer]: 8000,
  [GameVariantCategory.MultiplayerFiesta]: 8000,
  // HCS Strongholds and Oddball respawns are not published; both match the ranked arena slayer
  // duration until theatre-verified otherwise
  [GameVariantCategory.MultiplayerStrongholds]: 8000,
  [GameVariantCategory.MultiplayerOddball]: 8000,
  // Attrition uses a lives-pool mechanic with teammate revival; respawn duration TBD
};
