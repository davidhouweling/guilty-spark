import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { aFakeLogServiceWith } from "../fakes/log.fake";
import type { JsonAny, LogService } from "../types";
import { JobProgressLogger } from "../job-progress-logger";

describe("JobProgressLogger", () => {
  let logService: LogService;
  let infoSpy: MockInstance<LogService["info"]>;
  let errorSpy: MockInstance<LogService["error"]>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T00:00:00.000Z"));
    logService = aFakeLogServiceWith();
    infoSpy = vi.spyOn(logService, "info");
    errorSpy = vi.spyOn(logService, "error");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("logs each step with the job context and elapsed time", () => {
    const progress = new JobProgressLogger(logService, "Test job", new Map([["guildId", "guild-1"]]));

    vi.advanceTimersByTime(1500);
    progress.step("thread created", new Map([["threadId", "thread-1"]]));

    expect(infoSpy).toHaveBeenCalledWith(
      "Test job: thread created",
      new Map<string, JsonAny>([
        ["guildId", "guild-1"],
        ["threadId", "thread-1"],
        ["job", "Test job"],
        ["step", "thread created"],
        ["elapsedMs", 1500],
      ]),
    );
  });

  it("logs failures as errors with elapsed time", () => {
    const progress = new JobProgressLogger(logService, "Test job");
    const error = new Error("boom");

    vi.advanceTimersByTime(250);
    progress.failed(error);

    expect(errorSpy).toHaveBeenCalledWith(
      error,
      new Map<string, JsonAny>([
        ["job", "Test job"],
        ["step", "failed"],
        ["elapsedMs", 250],
      ]),
    );
  });
});
