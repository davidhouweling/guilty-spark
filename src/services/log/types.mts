export type JsonAny = boolean | number | string | null | undefined | JsonAny[] | { [key: string]: JsonAny };

export interface LogService {
  debug(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void;

  info(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void;

  warn(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void;

  error(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void;

  fatal(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void;
}
