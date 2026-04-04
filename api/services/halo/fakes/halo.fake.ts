import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { aFakeXboxServiceWith } from "../../xbox/fakes/xbox.fake";
import type { HaloServiceOpts } from "../halo";
import { HaloService } from "../halo";
import { aFakeHaloInfiniteClient } from "./infinite-client.fake";
import { aFakePlayerMatchesRateLimiterWith } from "./player-matches-rate-limiter.fake";

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
