/* eslint-disable @typescript-eslint/no-unused-vars */

import type { BaseLogService } from "../base-log-service";
import type { JsonAny, LogService } from "../types";

export class FakeLogService implements BaseLogService {
  debug(_message: unknown, _extra?: ReadonlyMap<string, JsonAny>): void {
    // no-op
  }
  info(_message: unknown, _extra?: ReadonlyMap<string, JsonAny>): void {
    // no-op
  }
  warn(_message: unknown, _extra?: ReadonlyMap<string, JsonAny>): void {
    // no-op
  }
  error(_message: unknown, _extra?: ReadonlyMap<string, JsonAny>): void {
    // no-op
  }
  fatal(_message: unknown, _extra?: ReadonlyMap<string, JsonAny>): void {
    // no-op
  }
}

export function aFakeLogServiceWith(_opts: Record<string, unknown> = {}): LogService {
  return new FakeLogService();
}
