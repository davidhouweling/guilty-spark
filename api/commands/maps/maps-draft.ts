import type { MapMode } from "../../services/halo/hcs";
import type { MapsFormatType, MapsPlaylistType } from "../../services/database/types/guild_config";

export interface MapsDraft {
  userId: string;
  count: number;
  playlist: MapsPlaylistType;
  format: MapsFormatType;
  maps: { mode: MapMode; map: string }[];
}

export const MAP_DRAFT_TTL_SECONDS = 60 * 60 * 6;
