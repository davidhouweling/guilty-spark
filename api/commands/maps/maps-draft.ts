import type { MapMode } from "../../services/halo/hcs";
import { MapsFormatType } from "../../services/database/types/guild_config";
import type { MapsPlaylistType } from "../../services/database/types/guild_config";

export interface MapsDraft {
  userId: string;
  count: number;
  playlist: MapsPlaylistType;
  format: MapsFormatType;
  maps: { mode: MapMode; map: string }[];
}

export const MAP_DRAFT_TTL_SECONDS = 60 * 60 * 6;

export function normalizeMapsFormat(format: MapsFormatType, availableModes: MapMode[]): MapsFormatType {
  return availableModes.length > 1 ? format : MapsFormatType.SLAYER;
}
