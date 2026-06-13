import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { aFakeHaloFilmServiceWith } from "../../halo/fakes/halo-film.fake";
import type { AnalyticsServiceOpts } from "../analytics";
import { AnalyticsService } from "../analytics";

export function aFakeAnalyticsServiceWith(opts: Partial<AnalyticsServiceOpts> = {}): AnalyticsService {
  const haloService = opts.haloService ?? aFakeHaloServiceWith();
  const haloFilmService = opts.haloFilmService ?? aFakeHaloFilmServiceWith();

  return new AnalyticsService({ haloService, haloFilmService });
}
