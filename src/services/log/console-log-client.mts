import type { LogService, JsonAny } from "./types.mjs";

export class ConsoleLogClient implements LogService {
  debug(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.debug(error, extra);
  }

  info(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.info(error, extra);
  }

  warn(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.warn(error, extra);
  }

  error(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.error(error, extra);
  }

  fatal(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.error("FATAL:", error, extra);
  }
}
