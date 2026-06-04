import type { Mocked } from "vitest";
import { vi } from "vitest";
import type { DatabaseService } from "../../database/database";
import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake";
import { IndividualTrackerService } from "../individual-tracker";

export function aFakeIndividualTrackerServiceWith(
  opts: { databaseService?: DatabaseService } = {},
): Mocked<IndividualTrackerService> {
  const service = new IndividualTrackerService({
    databaseService: opts.databaseService ?? aFakeDatabaseServiceWith(),
  }) as Mocked<IndividualTrackerService>;

  service.getSettings = vi.fn<IndividualTrackerService["getSettings"]>().mockResolvedValue({});
  service.getSettingsForView = vi.fn<IndividualTrackerService["getSettingsForView"]>().mockResolvedValue({});
  service.updateSettings = vi.fn<IndividualTrackerService["updateSettings"]>().mockResolvedValue({});

  return service;
}
