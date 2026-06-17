import type { LogService, JsonAny } from "./types";

export class ConsoleLogClient implements LogService {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  debug(_message: unknown, _extra?: ReadonlyMap<string, JsonAny>): void {
    // no-op
  }

  info(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void {
    console.info(this.format(message, extra));
  }

  warn(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void {
    console.warn(this.format(message, extra, this.captureCallSiteStack()));
  }

  error(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void {
    console.error(this.format(message, extra, this.captureCallSiteStack()));
  }

  fatal(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void {
    console.error("FATAL:", this.format(message, extra, this.captureCallSiteStack()));
  }

  private toJsonSafe(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }
    if (value === undefined || typeof value === "function" || typeof value === "symbol") {
      return String(value);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return "[unserializable]";
    }
  }

  private captureCallSiteStack(): string {
    const lines = new Error().stack?.split("\n") ?? [];
    return lines
      .filter(
        (line) =>
          line !== "Error" &&
          !line.startsWith("Error") &&
          !line.includes("console-log-client") &&
          !line.includes("aggregator-client"),
      )
      .slice(0, 10)
      .join("\n");
  }

  private format(message: unknown, extra?: ReadonlyMap<string, JsonAny>, callStack?: string): string {
    const content: Record<string, JsonAny> = {};

    if (extra != null) {
      for (const [key, value] of extra) {
        content[key] = value;
      }
    }

    if (message instanceof Error) {
      content["message"] = message.message;
      if (message.stack != null) {
        content["stack"] = message.stack;
      }
    } else {
      content["message"] = this.toJsonSafe(message);
    }

    if (callStack != null && callStack.length > 0) {
      content["callStack"] = callStack;
    }

    return JSON.stringify(content, null, 2);
  }
}
