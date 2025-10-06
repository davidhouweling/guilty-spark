import { captureException, addBreadcrumb, captureMessage } from "@sentry/cloudflare";
import type { LogService, JsonAny } from "./types.mjs";

export class SentryLogClient implements LogService {
  private readonly shouldLog: boolean;

  constructor(mode: "development" | "production" = "production") {
    this.shouldLog = mode === "production";
  }

  debug(error: Error | string, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    if (!this.shouldLog) {
      return;
    }
    
    addBreadcrumb({
      category: "debug",
      message: error instanceof Error ? error.message : error,
      level: "debug",
      data: Object.fromEntries(extra),
    });
  }

  info(error: Error | string, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    if (!this.shouldLog) {
      return;
    }
    
    if (error instanceof Error) {
      captureException(error, {
        level: "info",
        extra: Object.fromEntries(extra),
      });
    } else {
      captureMessage(error, {
        level: "info",
        extra: Object.fromEntries(extra),
      });
    }
  }

  warn(error: Error | string, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    if (!this.shouldLog) {
      return;
    }
    
    if (error instanceof Error) {
      captureException(error, {
        level: "warning",
        extra: Object.fromEntries(extra),
      });
    } else {
      captureMessage(error, {
        level: "warning",
        extra: Object.fromEntries(extra),
      });
    }
  }

  error(error: Error | string, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    if (!this.shouldLog) {
      return;
    }
    
    if (error instanceof Error) {
      captureException(error, {
        level: "error",
        extra: Object.fromEntries(extra),
      });
    } else {
      captureMessage(error, {
        level: "error",
        extra: Object.fromEntries(extra),
      });
    }
  }

  fatal(error: Error | string, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    if (!this.shouldLog) {
      return;
    }
    
    if (error instanceof Error) {
      captureException(error, {
        level: "fatal",
        extra: Object.fromEntries(extra),
      });
    } else {
      captureMessage(error, {
        level: "fatal",
        extra: Object.fromEntries(extra),
      });
    }
  }
}
