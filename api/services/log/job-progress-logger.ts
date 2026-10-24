import { differenceInMilliseconds } from "date-fns";
import type { JsonAny, LogService } from "./types";

/**
 * Emits breadcrumb logs for long-running background jobs (e.g. `ctx.waitUntil` work).
 * When the runtime cancels a job, no catch/finally runs, so the last logged step is
 * the only signal of where the job stalled.
 */
export class JobProgressLogger {
  private readonly startedAt = new Date();

  constructor(
    private readonly logService: LogService,
    private readonly jobName: string,
    private readonly context: ReadonlyMap<string, JsonAny> = new Map(),
  ) {}

  step(step: string, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    this.logService.info(`${this.jobName}: ${step}`, this.withTiming(step, extra));
  }

  failed(error: unknown, extra: ReadonlyMap<string, JsonAny> = new Map()): void {
    this.logService.error(error, this.withTiming("failed", extra));
  }

  private withTiming(step: string, extra: ReadonlyMap<string, JsonAny>): ReadonlyMap<string, JsonAny> {
    return new Map<string, JsonAny>([
      ...this.context,
      ...extra,
      ["job", this.jobName],
      ["step", step],
      ["elapsedMs", differenceInMilliseconds(new Date(), this.startedAt)],
    ]);
  }
}
