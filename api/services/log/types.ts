export type JsonAny = boolean | number | string | null | undefined | JsonAny[] | { [key: string]: JsonAny };

export interface LogService {
  debug(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void;

  info(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void;

  warn(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void;

  error(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void;

  fatal(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void;
}
