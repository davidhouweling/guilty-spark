import type { DatabaseService } from "../../database/database";
import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake";
import { IndividualTrackerService } from "../individual-tracker";

export function aFakeIndividualTrackerServiceWith(
  opts: { databaseService?: DatabaseService } = {},
): IndividualTrackerService {
  return new IndividualTrackerService({ databaseService: opts.databaseService ?? aFakeDatabaseServiceWith() });
}
