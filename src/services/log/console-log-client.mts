import type { LogService, JsonAny } from "./types.mjs";

export class ConsoleLogClient implements LogService {
  debug(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.debug(error, extra ? Object.fromEntries(extra) : undefined);
  }

  info(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.info(error, extra ? Object.fromEntries(extra) : undefined);
  }

  warn(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.warn(error, extra ? Object.fromEntries(extra) : undefined);
  }

  error(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.error(error, extra ? Object.fromEntries(extra) : undefined);
  }

  fatal(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.error("FATAL:", error, extra ? Object.fromEntries(extra) : undefined);
  }
}
