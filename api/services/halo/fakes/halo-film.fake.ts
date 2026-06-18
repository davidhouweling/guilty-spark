import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeXboxServiceWith } from "../../xbox/fakes/xbox.fake";
import { CustomSpartanTokenProvider } from "../custom-spartan-token-provider";
import type { HaloFilmServiceOpts } from "../types";
import { HaloFilmService } from "../halo-film";

export function aFakeHaloFilmServiceWith(opts: Partial<HaloFilmServiceOpts> = {}): HaloFilmService {
  const env = opts.env ?? aFakeEnvWith();
  const spartanTokenProvider =
    opts.spartanTokenProvider ??
    new CustomSpartanTokenProvider({
      env,
      xboxService: aFakeXboxServiceWith({ env }),
    });

  return new HaloFilmService({ env, spartanTokenProvider, ...(opts.fetch != null ? { fetch: opts.fetch } : {}) });
}
