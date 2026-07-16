import { GameVariantCategory } from "halo-infinite-api";

export const KILL_RACE_RESPAWN_DURATION_MS: Partial<Record<number, number>> = {
  [GameVariantCategory.MultiplayerSlayer]: 5000,
  [GameVariantCategory.MultiplayerFiesta]: 5000,
  // Attrition uses a lives-pool mechanic with teammate revival; respawn duration TBD
};
