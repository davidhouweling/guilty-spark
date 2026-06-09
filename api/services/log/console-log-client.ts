import type { LogService, JsonAny } from "./types";

export class ConsoleLogClient implements LogService {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  debug(_error: Error | string, _extra?: ReadonlyMap<string, JsonAny>): void {
    // console.debug(error, extra ? JSON.stringify([...extra], null, 2) : undefined);
  }

  info(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.info(this.format(error, extra));
  }

  warn(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.warn(this.format(error, extra));
  }

  error(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.error(this.format(error, extra));
  }

  fatal(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    console.error("FATAL:", this.format(error, extra));
  }

  private format(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): string {
    const content: Record<string, JsonAny> = {
      message: typeof error === "string" ? error : error.message,
    };

    if (typeof error !== "string") {
      content["stack"] = error.stack;
    }

    if (extra) {
      for (const [key, value] of extra) {
        content[key] = value;
      }
    }

    return JSON.stringify(content, null, 2);
  }
}
