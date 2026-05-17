import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake";
import type { DatabaseService } from "../../database/database";
import { IndividualTrackerService } from "../individual-tracker";

export function aFakeIndividualTrackerServiceWith(
  opts: Partial<{ databaseService: DatabaseService }> = {},
): IndividualTrackerService {
  const databaseService = opts.databaseService ?? aFakeDatabaseServiceWith();

  return new IndividualTrackerService(databaseService);
}
