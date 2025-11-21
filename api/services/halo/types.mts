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

export const ISSUE_STATUS_CODES = [429, 526];
