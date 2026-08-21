import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../database/database";
import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake";
import type { LogService } from "../../log/types";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { LeaderboardDataReaper } from "../leaderboard-data-reaper";

describe("LeaderboardDataReaper", () => {
  let databaseService: DatabaseService;
  let logService: LogService;
  let reaper: LeaderboardDataReaper;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T12:00:00.000Z"));
    databaseService = aFakeDatabaseServiceWith();
    logService = aFakeLogServiceWith();
    reaper = new LeaderboardDataReaper({ databaseService, logService });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("removes expired leaderboard data and orphaned kill matrices using their respective retention windows", async () => {
    const deleteExpiredDataSpy = vi.spyOn(databaseService, "deleteExpiredLeaderboardData").mockResolvedValue();

    await reaper.execute();

    expect(deleteExpiredDataSpy).toHaveBeenCalledWith({
      leaderboardRetentionBoundary: 1_755_777_600,
      orphanedKillMatrixRetentionBoundary: 1_786_708_800,
    });
  });
});