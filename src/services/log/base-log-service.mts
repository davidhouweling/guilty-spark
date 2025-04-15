import type { JsonAny, LogService } from "./types.mjs";

export abstract class BaseLogService implements LogService {
  abstract debug(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void;

  abstract info(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void;

  abstract warn(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void;

  abstract error(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void;

  abstract fatal(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void;
}
