import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { HaloFilmService } from "../../halo/halo-film";
import { CustomSpartanTokenProvider } from "../../halo/custom-spartan-token-provider";
import { XboxService } from "../../xbox/xbox";
import { authenticate } from "@xboxreplay/xboxlive-auth";
import type { AnalyticsServiceOpts } from "../analytics";
import { AnalyticsService } from "../analytics";

export function aFakeAnalyticsServiceWith(opts: Partial<AnalyticsServiceOpts> = {}): AnalyticsService {
  const env = opts.env ?? aFakeEnvWith();
  const haloService = opts.haloService ?? aFakeHaloServiceWith({ env });
  const haloFilmService = opts.haloFilmService ?? new HaloFilmService({
    env,
    spartanTokenProvider: new CustomSpartanTokenProvider({
      env,
      xboxService: new XboxService({ env, authenticate }),
    }),
  });

  return new AnalyticsService({
    env,
    haloService,
    haloFilmService,
  });
}
