import type { JsonAny, LogService } from "./types";

export abstract class BaseLogService implements LogService {
  abstract debug(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void;

  abstract info(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void;

  abstract warn(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void;

  abstract error(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void;

  abstract fatal(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void;
}
