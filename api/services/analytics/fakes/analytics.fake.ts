import { authenticate } from "@xboxreplay/xboxlive-auth";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { HaloFilmService } from "../../halo/halo-film";
import { CustomSpartanTokenProvider } from "../../halo/custom-spartan-token-provider";
import { XboxService } from "../../xbox/xbox";
import type { AnalyticsServiceOpts } from "../analytics";
import { AnalyticsService } from "../analytics";

export function aFakeAnalyticsServiceWith(opts: Partial<AnalyticsServiceOpts> = {}): AnalyticsService {
  const haloService = opts.haloService ?? aFakeHaloServiceWith();
  const haloFilmService =
    opts.haloFilmService ??
    new HaloFilmService({
      env: aFakeEnvWith(),
      spartanTokenProvider: new CustomSpartanTokenProvider({
        env: aFakeEnvWith(),
        xboxService: new XboxService({ env: aFakeEnvWith(), authenticate }),
      }),
    });

  return new AnalyticsService({
    haloService,
    haloFilmService,
  });
}
