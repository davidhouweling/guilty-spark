import { captureException, addBreadcrumb } from "@sentry/cloudflare";
import type { LogService, JsonAny } from "./types.mjs";

export class SentryLogClient implements LogService {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  debug(_error: Error | string, _extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    // addBreadcrumb({
    //   category: "debug",
    //   message: error instanceof Error ? error.message : error,
    //   level: "debug",
    //   data: Object.fromEntries(extra),
    // });
  }

  info(error: Error | string, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    addBreadcrumb({
      category: "info",
      message: error instanceof Error ? error.message : error,
      level: "info",
      data: Object.fromEntries(extra),
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
