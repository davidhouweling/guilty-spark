import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";
import type { HaloServiceOpts } from "../halo.mjs";
import { HaloService } from "../halo.mjs";
import { aFakeHaloInfiniteClient } from "./infinite-client.fake.mjs";

export function aFakeHaloServiceWith(opts: Partial<HaloServiceOpts> = {}): HaloService {
  const logService = opts.logService ?? aFakeLogServiceWith();
  const databaseService = opts.databaseService ?? aFakeDatabaseServiceWith();
  const infiniteClient = opts.infiniteClient ?? aFakeHaloInfiniteClient();

  return new HaloService({
    logService,
    databaseService,
    infiniteClient,
  });
}
