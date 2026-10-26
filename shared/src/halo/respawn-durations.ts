import { GameVariantCategory } from "halo-infinite-api";

export const RESPAWN_DURATION_MS: Partial<Record<number, number>> = {
  [GameVariantCategory.MultiplayerSlayer]: 8000,
  [GameVariantCategory.MultiplayerFiesta]: 8000,
  [GameVariantCategory.MultiplayerStrongholds]: 8000,
  [GameVariantCategory.MultiplayerOddball]: 8000,
  [GameVariantCategory.MultiplayerKingOfTheHill]: 8000,
  [GameVariantCategory.MultiplayerCtf]: 8000,
  // Attrition uses a lives-pool mechanic with teammate revival; respawn duration TBD
};
