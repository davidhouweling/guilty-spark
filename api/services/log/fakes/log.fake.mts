/* eslint-disable @typescript-eslint/no-unused-vars */

import type { BaseLogService } from "../base-log-service.mjs";
import type { JsonAny, LogService } from "../types.mjs";

export class FakeLogService implements BaseLogService {
  debug(_error: Error | string, _extra?: ReadonlyMap<string, JsonAny>): void {
    // no-op
  }
  info(_error: Error | string, _extra?: ReadonlyMap<string, JsonAny>): void {
    // no-op
  }
  warn(_error: Error | string, _extra?: ReadonlyMap<string, JsonAny>): void {
    // no-op
  }
  error(_error: Error | string, _extra?: ReadonlyMap<string, JsonAny>): void {
    // no-op
  }
  fatal(_error: Error | string, _extra?: ReadonlyMap<string, JsonAny>): void {
    // no-op
  }
}

export function aFakeLogServiceWith(_opts: Record<string, unknown> = {}): LogService {
  return new FakeLogService();
}
