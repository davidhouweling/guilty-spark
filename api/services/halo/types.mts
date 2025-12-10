import type { UserInfo as HaloUserInfo } from "halo-infinite-api";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error.mjs";

export type UserInfo = Pick<HaloUserInfo, "xuid" | "gamertag">;

export interface MatchPlayer {
  id: string;
  username: string;
  globalName: string | null;
  guildNickname: string | null;
}

export interface SeriesData {
  startDateTime: Date;
  endDateTime: Date;
  teams: MatchPlayer[][];
}

export interface Medal {
  name: string;
  sortingWeight: number;
  difficulty: string;
  type: string;
}

export enum FetchablePlaylist {
  RANKED_ARENA = "edfef3ac-9cbe-4fa2-b949-8f29deafd483",
  RANKED_DOUBLES = "fa5aa2a3-2428-4912-a023-e1eeea7b877c",
  RANKED_FFA = "71734db4-4b8e-4682-9206-62b6eff92582",
  RANKED_SLAYER = "dcb2e24e-05fb-4390-8076-32a0cdb4326e",
  RANKED_SNIPERS = "a883e7e1-9aca-4296-9009-3733a0ca8081",
  RANKED_SQUAD_BATTLE = "6dc5f699-d6d9-41c4-bdf8-7ae11dec2d1b",
  RANKED_TACTICAL = "7c60fb3e-656c-4ada-a085-293562642e50",
}

export const noMatchError = new EndUserError(
  [
    "Unable to match any of the Discord users to their Xbox accounts.",
    "**How to fix**: Players from the series, click the connect button below to connect your Discord account to your Xbox account.",
  ].join("\n"),
  {
    title: "No matches found",
    errorType: EndUserErrorType.WARNING,
    handled: true,
    actions: ["connect"],
  },
);

export const TimeInSeconds = {
  "1_MINUTE": 60,
  "5_MINUTES": 300,
  "1_HOUR": 3600,
  "1_DAY": 86400,
  "1_WEEK": 604800,
  "30_DAYS": 2592000,
};

export interface EsraMatchData {
  matchId: string;
  esra: number;
  gameMode: string; // ${AssetId}:${VersionId}
  matchEndTime: string;
}

export interface EsraCacheValue {
  xuid: string;
  playlistId: string;
  computedAt: string;
  esra: number;
  lastMatchId: string;
  matchData: Record<string, EsraMatchData>; // keyed by gameMode (${AssetId}:${VersionId})
}

export interface CircuitBreakerState {
  activatedAt: number;
  expiresAt: number;
  reason: string;
}

export interface ErrorWindow {
  windowStart: number;
  errors: ErrorRecord[];
}

export interface ErrorRecord {
  timestamp: number;
  statusCode: number;
  url: string;
}

export enum ProxyType {
  NONE = "none",
  JSON_RPC = "json-rpc",
  URL_REWRITE = "url-rewrite",
}

export interface ProxyConfig {
  type: ProxyType;
  baseUrl: string;
  enabled: boolean;
}

export const KV_KEYS = {
  PROXY_ENABLED: "halo:proxy:enabled",
  CIRCUIT_BREAKER: "halo:proxy:circuit_breaker",
  ERROR_WINDOW: "halo:proxy:errors",
};

export const CIRCUIT_BREAKER_CONFIG = {
  ERROR_THRESHOLD: 3,
  ERROR_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  CIRCUIT_BREAKER_DURATION_MS: 60 * 60 * 1000, // 1 hour
  ERROR_TRACKING_TTL_SECONDS: 24 * 60 * 60, // 24 hours
};

export const ISSUE_STATUS_CODES = [526];
