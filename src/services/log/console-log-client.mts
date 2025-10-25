import type { LogService, JsonAny } from "./types.mjs";

export class ConsoleLogClient implements LogService {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  debug(_error: Error | string, _extra?: ReadonlyMap<string, JsonAny>): void {
    // console.debug(error, extra ? JSON.stringify([...extra], null, 2) : undefined);
  }

  info(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.info(error, extra ? JSON.stringify([...extra], null, 2) : undefined);
  }

  warn(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.warn(error, extra ? JSON.stringify([...extra], null, 2) : undefined);
  }

  error(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.error(error, extra ? JSON.stringify([...extra], null, 2) : undefined);
  }

  fatal(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.error("FATAL:", error, extra ? JSON.stringify([...extra], null, 2) : undefined);
  }
}
