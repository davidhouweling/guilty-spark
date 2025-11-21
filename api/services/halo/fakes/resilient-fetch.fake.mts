import type { CircuitBreakerState, ErrorWindow } from "../types.mjs";

interface FakeCircuitBreakerStateOptions {
  activatedAt?: number;
  expiresAt?: number;
  reason?: string;
}

export function aFakeCircuitBreakerStateWith(options: FakeCircuitBreakerStateOptions = {}): CircuitBreakerState {
  const now = Date.now();
  return {
    activatedAt: options.activatedAt ?? now,
    expiresAt: options.expiresAt ?? now + 60 * 60 * 1000, // 1 hour
    reason: options.reason ?? "Rate limit errors detected",
  };
}

interface FakeErrorWindowOptions {
  windowStart?: number;
  errorCount?: number;
  statusCode?: number;
  url?: string;
}

export function aFakeErrorWindowWith(options: FakeErrorWindowOptions = {}): ErrorWindow {
  const now = Date.now();
  const windowStart = options.windowStart ?? Math.floor(now / (15 * 60 * 1000));
  const errorCount = options.errorCount ?? 0;
  const statusCode = options.statusCode ?? 429;
  const url = options.url ?? "https://halostats.svc.halowaypoint.com/test";

  const errors = Array.from({ length: errorCount }, (_, i) => ({
    timestamp: now - i * 1000,
    statusCode,
    url,
  }));

  return {
    windowStart,
    errors,
  };
}

interface FakeResponseOptions {
  status?: number;
  statusText?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export function aFakeResponseWith(options: FakeResponseOptions = {}): Response {
  const status = options.status ?? 200;
  const statusText = options.statusText ?? "OK";
  const body = options.body !== undefined ? JSON.stringify(options.body) : null;
  const headers = new Headers(options.headers ?? {});

  return new Response(body, {
    status,
    statusText,
    headers,
  });
}
