import { authenticate } from "@xboxreplay/xboxlive-auth";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { XboxService } from "../../xbox/xbox";
import { CustomSpartanTokenProvider } from "../custom-spartan-token-provider";
import type { HaloFilmServiceOpts } from "../types";
import { HaloFilmService } from "../halo-film";

export function aFakeHaloFilmServiceWith(opts: Partial<HaloFilmServiceOpts> = {}): HaloFilmService {
  const env = opts.env ?? aFakeEnvWith();
  const spartanTokenProvider =
    opts.spartanTokenProvider ??
    new CustomSpartanTokenProvider({
      env,
      xboxService: new XboxService({ env, authenticate }),
    });

  return new HaloFilmService({ env, spartanTokenProvider });
}
