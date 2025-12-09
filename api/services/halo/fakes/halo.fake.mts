import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";
import { aFakeXboxServiceWith } from "../../xbox/fakes/xbox.fake.mjs";
import type { HaloServiceOpts } from "../halo.mjs";
import { HaloService } from "../halo.mjs";
import { aFakeHaloInfiniteClient } from "./infinite-client.fake.mjs";
import { aFakePlayerMatchesRateLimiterWith } from "./player-matches-rate-limiter.fake.mjs";

export function aFakeHaloServiceWith(opts: Partial<HaloServiceOpts> = {}): HaloService {
  const env = opts.env ?? aFakeEnvWith();
  const logService = opts.logService ?? aFakeLogServiceWith();
  const databaseService = opts.databaseService ?? aFakeDatabaseServiceWith();
  const xboxService = opts.xboxService ?? aFakeXboxServiceWith();
  const infiniteClient = opts.infiniteClient ?? aFakeHaloInfiniteClient();
  const playerMatchesRateLimiter = opts.playerMatchesRateLimiter ?? aFakePlayerMatchesRateLimiterWith();

  return new HaloService({
    env,
    logService,
    databaseService,
    xboxService,
    infiniteClient,
    playerMatchesRateLimiter,
  });
}
