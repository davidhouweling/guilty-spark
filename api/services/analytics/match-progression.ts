import { GameVariantCategory } from "halo-infinite-api";
import type { MatchScoreProgression } from "@guilty-spark/shared/contracts/stats/match-score-progression";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { HaloService } from "../halo/halo";
import type { HaloFilmService } from "../halo/halo-film";
import type { LogService } from "../log/types";

const KILL_RACE_GAME_MODES = new Set([
  GameVariantCategory.MultiplayerSlayer,
  GameVariantCategory.MultiplayerFiesta,
  GameVariantCategory.MultiplayerAttrition,
  GameVariantCategory.MultiplayerEscalation,
]);

export interface MatchProgressionServiceOpts {
  haloService: HaloService;
  haloFilmService: HaloFilmService;
  logService: LogService;
}

export class MatchProgressionService {
  private readonly haloService: HaloService;
  private readonly haloFilmService: HaloFilmService;
  private readonly logService: LogService;

  constructor({ haloService, haloFilmService, logService }: MatchProgressionServiceOpts) {
    this.haloService = haloService;
    this.haloFilmService = haloFilmService;
    this.logService = logService;
  }

  async getMatchScoreProgression(matchId: string): Promise<MatchScoreProgression> {
    const [matchStats] = await Promise.all([
      this.haloService.getMatchDetails([matchId]).then((results) => Preconditions.checkExists(results[0])),
      this.safeWarmAuthCache(),
    ]);

    const mode = matchStats.MatchInfo.GameVariantCategory;
    if (!KILL_RACE_GAME_MODES.has(mode)) {
      throw new Error(`Game mode ${mode.toString()} does not support kill-race score progression`);
    }

    const progression = await this.haloFilmService.buildSlayerProgression(matchStats);

    return {
      matchId,
      mode,
      durationMs: Math.round(getDurationInSeconds(matchStats.MatchInfo.Duration) * 1000),
      teamCount: new Set(matchStats.Teams.map((team) => team.TeamId)).size,
      targetScore: null,
      timeline: { type: "kill-race", events: progression.events },
    };
  }

  private async safeWarmAuthCache(): Promise<void> {
    try {
      await this.haloFilmService.warmAuthCache();
    } catch (error) {
      this.logService.warn(error, new Map([["context", "warmAuthCache pre-warm"]]));
    }
  }
}
