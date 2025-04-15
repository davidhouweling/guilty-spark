import { captureException, captureMessage } from "@sentry/cloudflare";
import type { LogService, JsonAny } from "./types.mjs";

export class SentryLogClient implements LogService {
  debug(error: Error | string, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    captureMessage(error instanceof Error ? error.message : error, {
      level: "debug",
      extra: Object.fromEntries(extra),
    });
  }

  info(error: Error | string, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    captureMessage(error instanceof Error ? error.message : error, {
      level: "info",
      extra: Object.fromEntries(extra),
    });
  }

  warn(error: Error | string, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    captureException(error, {
      level: "warning",
      extra: Object.fromEntries(extra),
    });
  }

  error(error: Error | string, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    captureException(error, {
      level: "error",
      extra: Object.fromEntries(extra),
    });
  }

  fatal(error: Error | string, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    captureException(error, {
      level: "fatal",
      extra: Object.fromEntries(extra),
    });
  }
}
