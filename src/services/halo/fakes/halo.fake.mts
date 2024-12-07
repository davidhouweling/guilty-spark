import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake.mjs";
import { HaloService } from "../halo.mjs";
import { aFakeHaloInfiniteClient } from "./infinite-client.fake.mjs";

export function aFakeHaloServiceWith(opts: Partial<HaloService> = {}): HaloService {
  const databaseService = aFakeDatabaseServiceWith();
  const infiniteClient = aFakeHaloInfiniteClient();

  return new HaloService({
    databaseService,
    infiniteClient,
    ...opts,
  });
}
