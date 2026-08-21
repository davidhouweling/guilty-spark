import { getUnixTime, subWeeks, subYears } from "date-fns";
import type { DatabaseService } from "../database/database";
import type { LogService } from "../log/types";

export interface LeaderboardDataReaperOpts {
  databaseService: DatabaseService;
  logService: LogService;
}

export class LeaderboardDataReaper {
  private readonly databaseService: DatabaseService;
  private readonly logService: LogService;

  constructor({ databaseService, logService }: LeaderboardDataReaperOpts) {
    this.databaseService = databaseService;
    this.logService = logService;
  }

  async execute(): Promise<void> {
    const now = new Date();
    const leaderboardRetentionBoundary = getUnixTime(subYears(now, 1));
    const orphanedKillMatrixRetentionBoundary = getUnixTime(subWeeks(now, 1));

    await this.databaseService.deleteExpiredLeaderboardData({
      leaderboardRetentionBoundary,
      orphanedKillMatrixRetentionBoundary,
    });
    this.logService.info(
      "LeaderboardDataReaper: completed",
      new Map([
        ["leaderboardRetentionBoundary", leaderboardRetentionBoundary.toString()],
        ["orphanedKillMatrixRetentionBoundary", orphanedKillMatrixRetentionBoundary.toString()],
      ]),
    );
  }
}
