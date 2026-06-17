import { captureException, addBreadcrumb, captureMessage } from "@sentry/cloudflare";
import type { LogService, JsonAny } from "./types";

/**
 * Sentry-based logging client that uses breadcrumbs for info/debug and
 * only creates issues for actual errors and warnings with Error objects.
 */
export class SentryLogClient implements LogService {
  private readonly shouldLog: boolean;

  constructor(mode: "development" | "production" = "production") {
    this.shouldLog = mode === "production";
  }

  private toMessage(message: unknown): string {
    if (message instanceof Error) {
      return message.message;
    }
    if (typeof message === "string") {
      return message;
    }
    if (message === undefined) {
      return "undefined";
    }
    try {
      return JSON.stringify(message);
    } catch {
      return "[unserializable]";
    }
  }

  debug(message: unknown, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    if (!this.shouldLog) {
      return;
    }

    addBreadcrumb({
      category: "debug",
      message: this.toMessage(message),
      level: "debug",
      data: Object.fromEntries(extra),
    });
  }

  info(message: unknown, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    if (!this.shouldLog) {
      return;
    }

    addBreadcrumb({
      category: "info",
      message: this.toMessage(message),
      level: "info",
      data: Object.fromEntries(extra),
    });
  }

  warn(message: unknown, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    if (!this.shouldLog) {
      return;
    }

    if (message instanceof Error) {
      captureException(message, {
        level: "warning",
        extra: Object.fromEntries(extra),
      });
    } else {
      addBreadcrumb({
        category: "warning",
        message: this.toMessage(message),
        level: "warning",
        data: Object.fromEntries(extra),
      });
    }
  }

  error(message: unknown, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    if (!this.shouldLog) {
      return;
    }

    if (message instanceof Error) {
      captureException(message, {
        level: "error",
        extra: Object.fromEntries(extra),
      });
    } else {
      captureMessage(this.toMessage(message), {
        level: "error",
        extra: Object.fromEntries(extra),
      });
    }
  }

  fatal(message: unknown, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    if (!this.shouldLog) {
      return;
    }

    if (message instanceof Error) {
      captureException(message, {
        level: "fatal",
        extra: Object.fromEntries(extra),
      });
    } else {
      captureMessage(this.toMessage(message), {
        level: "fatal",
        extra: Object.fromEntries(extra),
      });
    }
  }
}
