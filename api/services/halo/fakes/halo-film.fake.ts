import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import type { HaloFilmServiceOpts } from "../types";
import { HaloFilmService } from "../halo-film";
import { aFakeHaloInfiniteClient } from "./infinite-client.fake";

export function aFakeHaloFilmServiceWith(opts: Partial<HaloFilmServiceOpts> = {}): HaloFilmService {
  const env = opts.env ?? aFakeEnvWith();
  const client = opts.client ?? aFakeHaloInfiniteClient();

  return new HaloFilmService({ env, client });
}
