import type { Mocked } from "vitest";
import { vi } from "vitest";
import type { DatabaseService } from "../../database/database";
import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { IndividualTrackerService } from "../individual-tracker";

export function aFakeIndividualTrackerServiceWith(
  opts: { databaseService?: DatabaseService } = {},
): Mocked<IndividualTrackerService> {
  const service = new IndividualTrackerService({
    env: aFakeEnvWith(),
    logService: aFakeLogServiceWith(),
    databaseService: opts.databaseService ?? aFakeDatabaseServiceWith(),
  }) as Mocked<IndividualTrackerService>;

  service.deleteTracker = vi.fn<IndividualTrackerService["deleteTracker"]>().mockResolvedValue(undefined);
  service.getSettings = vi.fn<IndividualTrackerService["getSettings"]>().mockResolvedValue({});
  service.getSettingsForView = vi.fn<IndividualTrackerService["getSettingsForView"]>().mockResolvedValue({});
  service.updateSettings = vi.fn<IndividualTrackerService["updateSettings"]>().mockResolvedValue({});
  service.nudgeTrackers = vi.fn<IndividualTrackerService["nudgeTrackers"]>().mockResolvedValue(undefined);

  return service;
}
