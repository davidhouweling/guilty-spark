import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import type { AnalyticsServiceOpts } from "../analytics";
import { AnalyticsService } from "../analytics";

export function aFakeAnalyticsServiceWith(opts: Partial<AnalyticsServiceOpts> = {}): AnalyticsService {
  const env = opts.env ?? aFakeEnvWith();
  const haloService = opts.haloService ?? aFakeHaloServiceWith({ env });

  return new AnalyticsService({
    env,
    haloService,
  });
}
