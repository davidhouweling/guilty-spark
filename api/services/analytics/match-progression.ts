import type { MatchScoreProgression } from "@guilty-spark/shared/contracts/stats/match-score-progression";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { HaloService } from "../halo/halo";
import type { HaloFilmService } from "../halo/halo-film";

export interface MatchProgressionServiceOpts {
  haloService: HaloService;
  haloFilmService: HaloFilmService;
}

export class MatchProgressionService {
  private readonly haloService: HaloService;
  private readonly haloFilmService: HaloFilmService;

  constructor({ haloService, haloFilmService }: MatchProgressionServiceOpts) {
    this.haloService = haloService;
    this.haloFilmService = haloFilmService;
  }

  async getMatchScoreProgression(matchId: string): Promise<MatchScoreProgression> {
    const matchStats = Preconditions.checkExists((await this.haloService.getMatchDetails([matchId]))[0]);
    await this.haloFilmService.warmAuthCache();
    const progression = await this.haloFilmService.buildSlayerProgression(matchStats);

    return {
      matchId,
      mode: matchStats.MatchInfo.GameVariantCategory,
      durationMs: Math.round(getDurationInSeconds(matchStats.MatchInfo.Duration) * 1000),
      teamCount: matchStats.Teams.length,
      targetScore: null,
      timeline: { type: "kill-race", events: progression.events },
    };
  }
}
