import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake.mjs";
import type { HaloServiceOpts } from "../halo.mjs";
import { HaloService } from "../halo.mjs";
import { aFakeHaloInfiniteClient } from "./infinite-client.fake.mjs";

export function aFakeHaloServiceWith(opts: Partial<HaloServiceOpts> = {}): HaloService {
  const databaseService = aFakeDatabaseServiceWith();
  const infiniteClient = aFakeHaloInfiniteClient();

  return new HaloService({
    databaseService,
    infiniteClient,
    ...opts,
  });
}
