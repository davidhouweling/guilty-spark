import * as Sentry from "@sentry/cloudflare";

export function captureSentryException(error: Error | string, extra?: Record<string, unknown>): void {
  // Capture exception directly using Sentry functions
  if (error instanceof Error) {
    Sentry.captureException(error, {
      extra: extra ?? {},
    });
  } else {
    Sentry.captureMessage(error, {
      level: "error",
      extra: extra ?? {},
    });
  }
}

export function captureSentryMessage(message: string, level: "debug" | "info" | "warning" | "error" | "fatal" = "info", extra?: Record<string, unknown>): void {
  Sentry.captureMessage(message, {
    level,
    extra: extra ?? {},
  });
}